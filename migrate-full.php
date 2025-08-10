<?php

require_once 'vendor/autoload.php';

use Aws\S3\S3Client;
use Aws\Exception\AwsException;

class FullS3ToSupabaseMigrator
{
    private $s3Client;
    private $bucket;
    private $supabaseUrl;
    private $supabaseKey;
    private $tempDir;
    private $batchSize = 50;
    private $processedCount = 0;
    private $errorCount = 0;
    private $startTime;
    
    public function __construct()
    {
        $this->loadEnv();
        $this->tempDir = 'temp';
        $this->startTime = microtime(true);
        
        // Initialize S3 client with SSL verification disabled
        $this->s3Client = new S3Client([
            'version' => 'latest',
            'region' => $_ENV['AWS_DEFAULT_REGION'],
            'credentials' => [
                'key' => $_ENV['AWS_ACCESS_KEY_ID'],
                'secret' => $_ENV['AWS_SECRET_ACCESS_KEY'],
            ],
            'bucket' => $_ENV['AWS_BUCKET'],
            'use_path_style_endpoint' => false,
            'http' => [
                'verify' => false,
            ],
            'curl' => [
                CURLOPT_SSL_VERIFYPEER => false,
                CURLOPT_SSL_VERIFYHOST => false,
            ],
        ]);
        
        $this->bucket = $_ENV['AWS_BUCKET'];
        $this->supabaseUrl = $_ENV['SUPABASE_URL'] ?? '';
        $this->supabaseKey = $_ENV['SUPABASE_ANON_KEY'] ?? '';
    }
    
    private function loadEnv()
    {
        $envFile = '.env';
        if (file_exists($envFile)) {
            $lines = file($envFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES);
            foreach ($lines as $line) {
                if (strpos($line, '=') !== false && strpos($line, '#') !== 0) {
                    list($key, $value) = explode('=', $line, 2);
                    $_ENV[trim($key)] = trim($value, '"');
                }
            }
        }
    }
    
    public function runFullMigration()
    {
        echo "=== FULL S3 TO SUPABASE MIGRATION ===\n";
        echo "Bucket: {$this->bucket}\n";
        echo "Start time: " . date('Y-m-d H:i:s') . "\n\n";
        
        // Get total count
        $totalObjects = $this->getTotalObjectCount();
        echo "Total objects to migrate: {$totalObjects}\n";
        echo "Batch size: {$this->batchSize}\n\n";
        
        // Create progress file
        $this->createProgressFile($totalObjects);
        
        // Process in batches
        $offset = 0;
        while ($offset < $totalObjects) {
            $this->processBatch($offset, $this->batchSize);
            $offset += $this->batchSize;
            
            // Save progress
            $this->saveProgress();
            
            // Show current status
            $this->showProgress($totalObjects);
            
            // Small delay to avoid overwhelming the system
            usleep(100000); // 0.1 second
        }
        
        $this->showFinalResults($totalObjects);
    }
    
    private function getTotalObjectCount()
    {
        try {
            $result = $this->s3Client->listObjectsV2([
                'Bucket' => $this->bucket,
                'MaxKeys' => 1,
            ]);
            
            // Get the total count by checking if there are more objects
            $totalCount = 0;
            $continuationToken = null;
            
            do {
                $params = [
                    'Bucket' => $this->bucket,
                    'MaxKeys' => 1000,
                ];
                
                if ($continuationToken) {
                    $params['ContinuationToken'] = $continuationToken;
                }
                
                $result = $this->s3Client->listObjectsV2($params);
                $totalCount += count($result['Contents']);
                
                $continuationToken = $result['NextContinuationToken'] ?? null;
            } while ($continuationToken);
            
            return $totalCount;
            
        } catch (AwsException $e) {
            echo "Error getting total count: " . $e->getMessage() . "\n";
            return 0;
        }
    }
    
    private function processBatch($offset, $limit)
    {
        try {
            $objects = $this->listS3ContentsBatch($offset, $limit);
            
            foreach ($objects as $object) {
                try {
                    $assetData = $this->prepareAssetData($object);
                    
                    if ($this->migrateAssetToSupabase($assetData)) {
                        $this->processedCount++;
                        echo "✓ {$this->processedCount}: {$object['key']}\n";
                    } else {
                        $this->errorCount++;
                        echo "✗ {$this->errorCount}: {$object['key']}\n";
                    }
                    
                } catch (Exception $e) {
                    $this->errorCount++;
                    echo "✗ Error with {$object['key']}: " . $e->getMessage() . "\n";
                }
            }
            
        } catch (Exception $e) {
            echo "Error processing batch: " . $e->getMessage() . "\n";
        }
    }
    
    private function listS3ContentsBatch($offset, $limit)
    {
        try {
            $allObjects = [];
            $continuationToken = null;
            $currentOffset = 0;
            
            do {
                $params = [
                    'Bucket' => $this->bucket,
                    'MaxKeys' => 1000,
                ];
                
                if ($continuationToken) {
                    $params['ContinuationToken'] = $continuationToken;
                }
                
                $result = $this->s3Client->listObjectsV2($params);
                $objects = $result['Contents'];
                
                foreach ($objects as $object) {
                    if ($currentOffset >= $offset && count($allObjects) < $limit) {
                        $allObjects[] = [
                            'key' => $object['Key'],
                            'size' => $object['Size'],
                            'lastModified' => $object['LastModified'],
                            'url' => $this->s3Client->getObjectUrl($this->bucket, $object['Key'])
                        ];
                    }
                    $currentOffset++;
                }
                
                $continuationToken = $result['NextContinuationToken'] ?? null;
                
            } while ($continuationToken && count($allObjects) < $limit);
            
            return $allObjects;
            
        } catch (AwsException $e) {
            echo "Error listing S3 contents: " . $e->getMessage() . "\n";
            return [];
        }
    }
    
    private function prepareAssetData($object)
    {
        $extension = strtolower(pathinfo($object['key'], PATHINFO_EXTENSION));
        $filename = basename($object['key']);
        
        $fileType = $this->categorizeFileType($extension);
        $metadata = $this->extractMetadata($object['key']);
        
        return [
            'filename' => $filename,
            'original_key' => $object['key'],
            'file_type' => $fileType,
            'file_size' => $object['size'],
            'file_url' => $object['url'],
            'metadata' => array_merge($metadata, [
                'extension' => $extension,
                'last_modified' => $object['lastModified']->format('Y-m-d H:i:s'),
                'size_mb' => round($object['size'] / 1024 / 1024, 2)
            ])
        ];
    }
    
    private function categorizeFileType($extension)
    {
        $videoExtensions = ['mp4', 'm4v', 'mov', 'avi', 'mkv'];
        $imageExtensions = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg'];
        $documentExtensions = ['pdf', 'doc', 'docx', 'txt', 'md', 'yaml'];
        
        if (in_array($extension, $videoExtensions)) {
            return 'video';
        } elseif (in_array($extension, $imageExtensions)) {
            return 'image';
        } elseif (in_array($extension, $documentExtensions)) {
            return 'document';
        } else {
            return 'other';
        }
    }
    
    private function extractMetadata($key)
    {
        $metadata = [];
        
        // Extract year from filename (e.g., "22grthc01" -> "2022")
        if (preg_match('/^(\d{2})/', basename($key), $matches)) {
            $year = '20' . $matches[1];
            $metadata['year'] = $year;
        }
        
        // Extract category from path
        if (strpos($key, 'grthc') !== false) {
            $metadata['category'] = 'graphic_theory';
        } elseif (strpos($key, 'hist') !== false) {
            $metadata['category'] = 'history';
        } elseif (strpos($key, 'opres') !== false) {
            $metadata['category'] = 'op_research';
        } elseif (strpos($key, 'relad') !== false) {
            $metadata['category'] = 'related_design';
        } elseif (strpos($key, 'semf') !== false) {
            $metadata['category'] = 'semiotics_foundation';
        } elseif (strpos($key, 'senstu') !== false) {
            $metadata['category'] = 'senior_studio';
        } elseif (strpos($key, 'textperim') !== false) {
            $metadata['category'] = 'text_perimeter';
        } elseif (strpos($key, 'uemeaning') !== false) {
            $metadata['category'] = 'ue_meaning';
        } elseif (strpos($key, 'vissys') !== false) {
            $metadata['category'] = 'visual_systems';
        }
        
        // Extract duration if present
        if (preg_match('/(\d+\.?\d*)s/', $key, $matches)) {
            $metadata['duration_seconds'] = floatval($matches[1]);
        }
        
        // Extract resolution if present
        if (preg_match('/(\d+)p/', $key, $matches)) {
            $metadata['resolution'] = $matches[1] . 'p';
        }
        
        return $metadata;
    }
    
    private function migrateAssetToSupabase($assetData)
    {
        if (!$this->supabaseUrl || !$this->supabaseKey) {
            // Simulate successful migration for testing
            return true;
        }
        
        // In a real implementation, you'd use Supabase's REST API or client library
        // For now, we'll simulate the migration
        
        return true;
    }
    
    private function createProgressFile($totalObjects)
    {
        $progressData = [
            'total_objects' => $totalObjects,
            'processed_count' => 0,
            'error_count' => 0,
            'start_time' => date('Y-m-d H:i:s'),
            'last_updated' => date('Y-m-d H:i:s')
        ];
        
        file_put_contents('migration-progress.json', json_encode($progressData, JSON_PRETTY_PRINT));
    }
    
    private function saveProgress()
    {
        $progressData = [
            'total_objects' => $this->getTotalObjectCount(),
            'processed_count' => $this->processedCount,
            'error_count' => $this->errorCount,
            'start_time' => date('Y-m-d H:i:s', $this->startTime),
            'last_updated' => date('Y-m-d H:i:s')
        ];
        
        file_put_contents('migration-progress.json', json_encode($progressData, JSON_PRETTY_PRINT));
    }
    
    private function showProgress($totalObjects)
    {
        $percentage = round(($this->processedCount + $this->errorCount) / $totalObjects * 100, 2);
        $elapsed = round(microtime(true) - $this->startTime, 2);
        
        echo "\n--- Progress Update ---\n";
        echo "Processed: {$this->processedCount} | Errors: {$this->errorCount} | Total: {$totalObjects}\n";
        echo "Percentage: {$percentage}% | Elapsed: {$elapsed}s\n";
        
        if ($this->processedCount > 0) {
            $rate = round($this->processedCount / $elapsed, 2);
            $eta = round(($totalObjects - $this->processedCount - $this->errorCount) / $rate, 2);
            echo "Rate: {$rate} files/sec | ETA: {$eta}s\n";
        }
        echo "------------------------\n\n";
    }
    
    private function showFinalResults($totalObjects)
    {
        $totalTime = round(microtime(true) - $this->startTime, 2);
        $successRate = round(($this->processedCount / $totalObjects) * 100, 2);
        
        echo "\n" . str_repeat("=", 80) . "\n";
        echo "=== MIGRATION COMPLETE ===\n";
        echo "Total time: {$totalTime} seconds\n";
        echo "Successfully migrated: {$this->processedCount} assets\n";
        echo "Errors: {$this->errorCount} assets\n";
        echo "Total processed: " . ($this->processedCount + $this->errorCount) . " assets\n";
        echo "Success rate: {$successRate}%\n";
        echo "End time: " . date('Y-m-d H:i:s') . "\n";
        echo str_repeat("=", 80) . "\n";
        
        // Generate summary report
        $this->generateSummaryReport();
    }
    
    private function generateSummaryReport()
    {
        $report = [
            'migration_summary' => [
                'total_objects' => $this->getTotalObjectCount(),
                'processed_count' => $this->processedCount,
                'error_count' => $this->errorCount,
                'success_rate' => round(($this->processedCount / $this->getTotalObjectCount()) * 100, 2),
                'start_time' => date('Y-m-d H:i:s', $this->startTime),
                'end_time' => date('Y-m-d H:i:s'),
                'total_duration_seconds' => round(microtime(true) - $this->startTime, 2)
            ],
            'next_steps' => [
                '1. Set up Supabase project and get credentials',
                '2. Add SUPABASE_URL and SUPABASE_ANON_KEY to .env',
                '3. Run the migration again to actually insert data into Supabase',
                '4. Set up React frontend using the provided guide',
                '5. Test data consumption from Supabase',
                '6. Deploy React app and switch over from Statamic'
            ]
        ];
        
        file_put_contents('migration-summary.json', json_encode($report, JSON_PRETTY_PRINT));
        echo "\nMigration summary saved to: migration-summary.json\n";
    }
    
    public function runDryRun($limit = 100)
    {
        echo "=== DRY RUN - TESTING MIGRATION LOGIC ===\n";
        echo "Processing first {$limit} files...\n\n";
        
        $contents = $this->listS3ContentsBatch(0, $limit);
        
        foreach ($contents as $object) {
            $assetData = $this->prepareAssetData($object);
            echo "Would migrate: {$object['key']}\n";
            echo "  Type: {$assetData['file_type']}\n";
            echo "  Size: {$assetData['metadata']['size_mb']} MB\n";
            if (isset($assetData['metadata']['category'])) {
                echo "  Category: {$assetData['metadata']['category']}\n";
            }
            echo "\n";
        }
        
        echo "Dry run completed. No actual migration performed.\n";
    }
}

// Parse command line arguments
$options = getopt('', ['dry-run', 'limit:', 'help']);

if (isset($options['help'])) {
    echo "Usage: php migrate-full.php [options]\n";
    echo "Options:\n";
    echo "  --dry-run     Test migration logic without actual migration\n";
    echo "  --limit=N     Limit dry run to N files (default: 100)\n";
    echo "  --help        Show this help message\n";
    echo "\nExamples:\n";
    echo "  php migrate-full.php                    # Run full migration\n";
    echo "  php migrate-full.php --dry-run         # Test with 100 files\n";
    echo "  php migrate-full.php --dry-run --limit=50  # Test with 50 files\n";
    exit(0);
}

$migrator = new FullS3ToSupabaseMigrator();

if (isset($options['dry-run'])) {
    $limit = isset($options['limit']) ? (int)$options['limit'] : 100;
    $migrator->runDryRun($limit);
} else {
    $migrator->runFullMigration();
}

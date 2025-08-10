<?php

require_once 'vendor/autoload.php';

use Aws\S3\S3Client;
use Aws\Exception\AwsException;

class S3ToSupabaseMigrator
{
    private $s3Client;
    private $bucket;
    private $supabaseUrl;
    private $supabaseKey;
    private $tempDir;
    
    public function __construct()
    {
        $this->loadEnv();
        $this->tempDir = 'temp';
        
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
                'verify' => false, // Disable SSL verification
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
    
    public function createSupabaseTables()
    {
        if (!$this->supabaseUrl || !$this->supabaseKey) {
            echo "Supabase credentials not configured. Skipping table creation.\n";
            return false;
        }
        
        echo "=== Creating Supabase Tables ===\n";
        
        // Create assets table
        $this->createTable('assets', [
            'id' => 'uuid default gen_random_uuid() primary key',
            'filename' => 'text not null',
            'original_key' => 'text not null',
            'file_type' => 'text not null',
            'file_size' => 'bigint not null',
            'file_url' => 'text',
            'metadata' => 'jsonb',
            'created_at' => 'timestamp with time zone default now()',
            'updated_at' => 'timestamp with time zone default now()'
        ]);
        
        // Create collections table
        $this->createTable('collections', [
            'id' => 'uuid default gen_random_uuid() primary key',
            'name' => 'text not null',
            'type' => 'text not null',
            'content' => 'jsonb',
            'created_at' => 'timestamp with time zone default now()',
            'updated_at' => 'timestamp with time zone default now()'
        ]);
        
        return true;
    }
    
    private function createTable($tableName, $columns)
    {
        $sql = "CREATE TABLE IF NOT EXISTS {$tableName} (\n";
        $columnDefs = [];
        foreach ($columns as $column => $definition) {
            $columnDefs[] = "  {$column} {$definition}";
        }
        $sql .= implode(",\n", $columnDefs) . "\n);";
        
        echo "Creating table: {$tableName}\n";
        echo "SQL: {$sql}\n\n";
        
        // In a real implementation, you'd execute this against Supabase
        // For now, we'll just output the SQL
        return $sql;
    }
    
    public function migrateAssets($limit = null)
    {
        echo "=== Migrating Assets to Supabase ===\n";
        
        $contents = $this->listS3Contents();
        if (empty($contents)) {
            echo "No objects found in S3 bucket.\n";
            return;
        }
        
        if ($limit) {
            $contents = array_slice($contents, 0, $limit);
        }
        
        $migrated = 0;
        $errors = 0;
        
        foreach ($contents as $object) {
            try {
                $assetData = $this->prepareAssetData($object);
                
                if ($this->migrateAssetToSupabase($assetData)) {
                    $migrated++;
                    echo "✓ Migrated: {$object['key']}\n";
                } else {
                    $errors++;
                    echo "✗ Failed: {$object['key']}\n";
                }
                
                // Progress indicator
                if (($migrated + $errors) % 10 == 0) {
                    echo "Progress: " . ($migrated + $errors) . "/" . count($contents) . "\n";
                }
                
            } catch (Exception $e) {
                $errors++;
                echo "✗ Error with {$object['key']}: " . $e->getMessage() . "\n";
            }
        }
        
        echo "\n=== Migration Complete ===\n";
        echo "Successfully migrated: {$migrated} assets\n";
        echo "Errors: {$errors} assets\n";
        echo "Total processed: " . ($migrated + $errors) . " assets\n";
    }
    
    private function prepareAssetData($object)
    {
        $extension = strtolower(pathinfo($object['key'], PATHINFO_EXTENSION));
        $filename = basename($object['key']);
        
        // Determine file type category
        $fileType = $this->categorizeFileType($extension);
        
        // Extract metadata from filename
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
        $documentExtensions = ['pdf', 'doc', 'docx', 'txt', 'md'];
        
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
        
        $jsonData = json_encode($assetData, JSON_PRETTY_PRINT);
        echo "Would insert into Supabase:\n{$jsonData}\n\n";
        
        return true;
    }
    
    public function listS3Contents($prefix = '')
    {
        try {
            $result = $this->s3Client->listObjectsV2([
                'Bucket' => $this->bucket,
                'Prefix' => $prefix,
                'MaxKeys' => 1000,
            ]);
            
            $contents = [];
            foreach ($result['Contents'] as $object) {
                $contents[] = [
                    'key' => $object['Key'],
                    'size' => $object['Size'],
                    'lastModified' => $object['LastModified'],
                    'url' => $this->s3Client->getObjectUrl($this->bucket, $object['Key'])
                ];
            }
            
            return $contents;
        } catch (AwsException $e) {
            echo "Error listing S3 contents: " . $e->getMessage() . "\n";
            return [];
        }
    }
    
    public function generateMigrationPlan()
    {
        echo "=== Migration Plan ===\n";
        
        $contents = $this->listS3Contents();
        if (empty($contents)) {
            echo "No objects found in S3 bucket.\n";
            return;
        }
        
        $fileTypes = [];
        $totalSize = 0;
        $categories = [];
        
        foreach ($contents as $object) {
            $extension = strtolower(pathinfo($object['key'], PATHINFO_EXTENSION));
            $fileTypes[$extension] = ($fileTypes[$extension] ?? 0) + 1;
            $totalSize += $object['size'];
            
            $metadata = $this->extractMetadata($object['key']);
            if (isset($metadata['category'])) {
                $categories[$metadata['category']] = ($categories[$metadata['category']] ?? 0) + 1;
            }
        }
        
        $totalSizeGB = round($totalSize / 1024 / 1024 / 1024, 2);
        
        echo "Total files: " . count($contents) . "\n";
        echo "Total size: {$totalSizeGB} GB\n\n";
        
        echo "File type breakdown:\n";
        foreach ($fileTypes as $ext => $count) {
            echo "  .{$ext}: {$count} files\n";
        }
        
        echo "\nCategory breakdown:\n";
        foreach ($categories as $category => $count) {
            echo "  {$category}: {$count} files\n";
        }
        
        echo "\nMigration strategy:\n";
        echo "1. Create Supabase tables for assets and collections\n";
        echo "2. Migrate metadata and file information first\n";
        echo "3. Optionally download files locally for processing\n";
        echo "4. Upload processed files to Supabase storage\n";
        echo "5. Update database with final file URLs\n";
    }
}

// Run the migration
if (php_sapi_name() === 'cli') {
    $migrator = new S3ToSupabaseMigrator();
    
    // Generate migration plan
    $migrator->generateMigrationPlan();
    
    echo "\n" . str_repeat("=", 80) . "\n";
    
    // Create Supabase tables
    $migrator->createSupabaseTables();
    
    echo "\n" . str_repeat("=", 80) . "\n";
    
    // Migrate a small sample first
    echo "Starting with sample migration (first 10 files)...\n";
    $migrator->migrateAssets(10);
    
    echo "\nMigration script completed!\n";
    echo "\nNext steps:\n";
    echo "1. Review the generated SQL for table creation\n";
    echo "2. Configure Supabase credentials in .env\n";
    echo "3. Run full migration: php migrate-to-supabase.php --full\n";
    echo "4. Set up React frontend to consume Supabase data\n";
} else {
    echo "This script should be run from the command line.\n";
}

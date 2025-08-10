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
    
    public function __construct()
    {
        // Load environment variables
        $this->loadEnv();
        
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
    
    public function downloadS3Object($key, $localPath = null)
    {
        try {
            if (!$localPath) {
                $localPath = 'temp/' . basename($key);
            }
            
            // Create temp directory if it doesn't exist
            if (!is_dir('temp')) {
                mkdir('temp', 0755, true);
            }
            
            $result = $this->s3Client->getObject([
                'Bucket' => $this->bucket,
                'Key' => $key,
                'SaveAs' => $localPath
            ]);
            
            echo "Downloaded: {$key} -> {$localPath}\n";
            return $localPath;
            
        } catch (AwsException $e) {
            echo "Error downloading {$key}: " . $e->getMessage() . "\n";
            return false;
        }
    }
    
    public function migrateToSupabase($data, $table = 'assets')
    {
        if (!$this->supabaseUrl || !$this->supabaseKey) {
            echo "Supabase credentials not configured. Skipping Supabase migration.\n";
            return false;
        }
        
        // This is a placeholder for Supabase integration
        // You'll need to implement the actual Supabase client calls
        echo "Would migrate to Supabase table: {$table}\n";
        echo "Data: " . json_encode($data, JSON_PRETTY_PRINT) . "\n";
        
        return true;
    }
    
    public function generateMigrationReport()
    {
        echo "=== S3 to Supabase Migration Report ===\n";
        echo "Bucket: {$this->bucket}\n";
        echo "Region: {$_ENV['AWS_DEFAULT_REGION']}\n";
        echo "Supabase URL: " . ($this->supabaseUrl ?: 'Not configured') . "\n\n";
        
        // List all contents
        $contents = $this->listS3Contents();
        
        if (empty($contents)) {
            echo "No objects found in S3 bucket.\n";
            return;
        }
        
        echo "Found " . count($contents) . " objects:\n";
        echo str_repeat('-', 80) . "\n";
        
        $totalSize = 0;
        foreach ($contents as $object) {
            $sizeMB = round($object['size'] / 1024 / 1024, 2);
            $totalSize += $object['size'];
            echo sprintf("%-50s %8s MB %s\n", 
                substr($object['key'], 0, 50), 
                $sizeMB,
                $object['lastModified']->format('Y-m-d H:i:s')
            );
        }
        
        $totalSizeMB = round($totalSize / 1024 / 1024, 2);
        echo str_repeat('-', 80) . "\n";
        echo "Total size: {$totalSizeMB} MB\n";
        
        // Group by file type
        $fileTypes = [];
        foreach ($contents as $object) {
            $extension = strtolower(pathinfo($object['key'], PATHINFO_EXTENSION));
            $fileTypes[$extension] = ($fileTypes[$extension] ?? 0) + 1;
        }
        
        echo "\nFile types:\n";
        foreach ($fileTypes as $ext => $count) {
            echo "  .{$ext}: {$count} files\n";
        }
    }
    
    public function downloadSampleFiles($limit = 5)
    {
        echo "\n=== Downloading Sample Files ===\n";
        
        $contents = $this->listS3Contents();
        $sampleFiles = array_slice($contents, 0, $limit);
        
        foreach ($sampleFiles as $file) {
            $this->downloadS3Object($file['key']);
        }
        
        echo "Sample files downloaded to 'temp/' directory\n";
    }
}

// Run the migration
if (php_sapi_name() === 'cli') {
    $migrator = new S3ToSupabaseMigrator();
    
    // Generate migration report
    $migrator->generateMigrationReport();
    
    // Download sample files
    $migrator->downloadSampleFiles(3);
    
    echo "\nMigration script completed!\n";
    echo "Next steps:\n";
    echo "1. Review the downloaded sample files\n";
    echo "2. Configure Supabase credentials in .env\n";
    echo "3. Implement Supabase upload logic\n";
    echo "4. Run full migration\n";
} else {
    echo "This script should be run from the command line.\n";
}

<?php

require_once 'vendor/autoload.php';

// Load .env file
$dotenv = Dotenv\Dotenv::createImmutable(__DIR__);
$dotenv->load();

use Spatie\YamlFrontMatter\YamlFrontMatter;
use Symfony\Component\Yaml\Yaml;

class ContentMigrator
{
    private $supabaseUrl;
    private $supabaseKey;
    private $dryRun = false;
    private $idMapping = []; // [statamic_id => supabase_uuid]
    private $entryPathMap = []; // [statamic_id => file_path]

    public function __construct($dryRun = false)
    {
        $this->dryRun = $dryRun;
        // $this->loadEnv(); // No longer needed, handled by Dotenv

        $this->supabaseUrl = $_ENV['SUPABASE_URL'] ?? null;
        $this->supabaseKey = $_ENV['SUPABASE_ANON_KEY'] ?? null;

        if (empty($this->supabaseUrl) || empty($this->supabaseKey)) {
            throw new Exception("Supabase URL or Anon Key is not configured. Please check your .env file.");
        }
    }

    private function loadEnv()
    {
        // This function is no longer needed as we are using Dotenv package now.
    }

    public function run()
    {
        echo $this->dryRun ? "--- DRY RUN ---\n" : "--- REAL MIGRATION ---\n";
        echo "Starting content migration...\n";

        $this->migratePages();
        // $this->migrateQuotes(); // We'll add this later

        echo "Content migration finished.\n";
    }

    private function migratePages()
    {
        echo "Migrating 'pages' collection...\n";
        $this->buildEntryPathMap();

        $treePath = 'content/trees/collections/pages.yaml';
        if (!file_exists($treePath)) {
            throw new Exception("Page tree file not found at {$treePath}");
        }

        $treeData = Yaml::parseFile($treePath);
        $this->traversePageTree($treeData['tree']);
    }

    private function traversePageTree($nodes, $parentId = null, $parentBlueprint = null, $order = 0)
    {
        foreach ($nodes as $node) {
            $statamicId = $node['entry'];
            $entryPath = $this->findEntryPath($statamicId);

            if (!$entryPath) {
                echo "✗ Could not find file for entry: {$statamicId}\n";
                continue;
            }
            
            try {
                $document = YamlFrontMatter::parse(file_get_contents($entryPath));
            } catch (\Exception $e) {
                echo "✗ Error parsing file for entry {$statamicId}: {$e->getMessage()}\n";
                continue;
            }

            $data = $document->matter();
            $data['content_body'] = $document->body();
            $data['statamic_id'] = $statamicId;
            $data['slug'] = basename($entryPath, '.md');

            $blueprint = $data['blueprint'] ?? 'content';
            
            $newUuid = null;
            switch ($blueprint) {
                case 'section':
                    $newUuid = $this->migrateSection($data, $order);
                    break;
                case 'index':
                    $newUuid = $this->migrateIndex($data, $parentId, $order);
                    break;
                case 'content':
                    $sectionId = ($parentBlueprint === 'section') ? $parentId : null;
                    $indexId = ($parentBlueprint === 'index') ? $parentId : null;
                    $newUuid = $this->migrateContentPage($data, $sectionId, $indexId, $order);
                    break;
            }

            if ($newUuid && !empty($node['children'])) {
                $this->traversePageTree($node['children'], $newUuid, $blueprint, 0);
            }
            $order++;
        }
    }

    private function buildEntryPathMap()
    {
        echo "Building entry path map...\n";
        $files = glob('content/collections/pages/*.md');
        foreach ($files as $file) {
            // This is faster than parsing the whole front matter every time.
            if (preg_match('/^id:\s*(.*?)$/m', file_get_contents($file), $matches)) {
                $this->entryPathMap[trim($matches[1])] = $file;
            }
        }
        echo "Map built for " . count($this->entryPathMap) . " page entries.\n";
    }

    private function migrateSection($data, $order)
    {
        echo "  -> Migrating Section: {$data['title']}\n";
        $payload = [
            'statamic_id' => $data['statamic_id'],
            'title' => $data['title'],
            'slug' => $data['slug'],
            'section_summary' => $data['section_summary'] ?? null,
            'intro_movie' => $data['intro_movie'] ?? null,
            'icon' => $data['icon'] ?? null,
            'section_color' => $data['section_color'] ?? null,
            'sort_order' => $order,
        ];
        return $this->postToSupabase('sections', $payload);
    }

    private function migrateIndex($data, $sectionId, $order)
    {
        echo "    -> Migrating Index: {$data['title']}\n";
        $payload = [
            'statamic_id' => $data['statamic_id'],
            'section_id' => $sectionId,
            'title' => $data['title'],
            'slug' => $data['slug'],
            'sort_order' => $order,
        ];
        return $this->postToSupabase('indices', $payload);
    }

    private function migrateContentPage($data, $sectionId, $indexId, $order)
    {
        echo "      -> Migrating Page: {$data['title']}\n";
        $payload = [
            'statamic_id' => $data['statamic_id'],
            'index_id' => $indexId,
            'section_id' => $sectionId,
            'title' => $data['title'],
            'slug' => $data['slug'],
            'thumbnail_image' => $data['thumbnail_image'] ?? null,
            'thumbnail_caption' => $data['thumbnail_caption'] ?? null,
            'thumbnail_slides' => !empty($data['thumbnail_slides']) ? '{' . implode(',', $data['thumbnail_slides']) . '}' : null,
            'intro_movie' => $data['intro_movie'] ?? null,
            'sort_order' => $order,
        ];

        $pageUuid = $this->postToSupabase('content_pages', $payload);

        if ($pageUuid && isset($data['main_content'])) {
            $this->migrateContentBlocks($data['main_content'], $pageUuid);
        }

        return $pageUuid;
    }

    private function migrateContentBlocks($blocks, $pageId)
    {
        echo "        -> Migrating Content Blocks...\n";
        $order = 0;
        foreach ($blocks as $block) {
            $blockPayload = [
                'page_id' => $pageId,
                'type' => $block['type'],
                'json_content' => json_encode($block),
                'sort_order' => $order,
            ];
            $this->postToSupabase('content_blocks', $blockPayload);
            $order++;
        }
    }

    private function postToSupabase($table, $data)
    {
        $statamicId = $data['statamic_id'] ?? null;

        if ($statamicId && isset($this->idMapping[$statamicId])) {
            return $this->idMapping[$statamicId];
        }

        if ($this->dryRun) {
            echo "DRY RUN: Would insert into {$table}: " . json_encode($data) . "\n";
            $fakeUuid = 'dry-run-' . uniqid();
            if ($statamicId) {
                $this->idMapping[$statamicId] = $fakeUuid;
            }
            return $fakeUuid;
        }

        $ch = curl_init("{$this->supabaseUrl}/rest/v1/{$table}");
        curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
        curl_setopt($ch, CURLOPT_HTTPHEADER, [
            'apikey: ' . $this->supabaseKey,
            'Authorization: Bearer ' . $this->supabaseKey,
            'Content-Type: application/json',
            'Prefer: return=representation'
        ]);
        curl_setopt($ch, CURLOPT_POST, true);
        curl_setopt($ch, CURLOPT_POSTFIELDS, json_encode($data));
        curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, false);

        $response = curl_exec($ch);
        $httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
        curl_close($ch);

        if ($httpCode >= 200 && $httpCode < 300) {
            $responseData = json_decode($response, true);
            $newUuid = $responseData[0]['id'];
            if ($statamicId) {
                $this->idMapping[$statamicId] = $newUuid;
            }
            return $newUuid;
        } else {
            echo "✗ Error posting to Supabase table '{$table}'. HTTP {$httpCode}\n";
            echo "  Response: {$response}\n";
            return null;
        }
    }

    private function findEntryPath($id)
    {
        return $this->entryPathMap[$id] ?? null;
    }

    // We will add migrateIndex, migrateContentPage, migrateContentBlocks, and migrateQuotes later
}


// --- Runner ---
$options = getopt('', ['dry-run', 'help']);
if (isset($options['help'])) {
    echo "Usage: php migrate-content.php [--dry-run]\n";
    exit(0);
}

$dryRun = isset($options['dry-run']);

try {
    $migrator = new ContentMigrator($dryRun);
    $migrator->run();
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
    exit(1);
}

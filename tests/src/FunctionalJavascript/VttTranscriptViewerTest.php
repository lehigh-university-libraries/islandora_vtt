<?php

namespace Drupal\Tests\islandora_vtt\FunctionalJavascript;

use Drupal\Core\File\FileSystemInterface;
use Drupal\field\Entity\FieldConfig;
use Drupal\field\Entity\FieldStorageConfig;
use Drupal\file\Entity\File;
use Drupal\FunctionalJavascriptTests\WebDriverTestBase;
use Drupal\language\Entity\ConfigurableLanguage;
use Drupal\media\Entity\Media;
use Drupal\media\Entity\MediaType;
use Drupal\node\Entity\Node;
use Drupal\taxonomy\Entity\Term;

/**
 * Tests the VTT transcript viewer.
 *
 * @group islandora_vtt
 */
class VttTranscriptViewerTest extends WebDriverTestBase {

  /**
   * {@inheritdoc}
   */
  protected static $modules = [
    'islandora',
    'islandora_core_feature',
    'islandora_text_extraction',
    'islandora_vtt',
    'language',
    'text',
  ];

  /**
   * {@inheritdoc}
   */
  protected $defaultTheme = 'stark';

  /**
   * The Extracted Text media-use term ID.
   *
   * @var int
   */
  protected int $extractedTextTid;

  /**
   * {@inheritdoc}
   */
  protected function setUp(): void {
    parent::setUp();

    $this->ensureMediaBundle('video');
    $this->ensureMediaBundle('extracted_text');
    $this->ensureEditedTextField();

    if (!ConfigurableLanguage::load('fr')) {
      ConfigurableLanguage::createFromLangcode('fr')->save();
    }

    $account = $this->drupalCreateUser([
      'access content',
      'view media',
    ]);
    $this->drupalLogin($account);

    $this->extractedTextTid = $this->getExtractedTextTid();
  }

  /**
   * Tests a single-language transcript hides language selection.
   */
  public function testSingleLanguageTranscriptCanBeDownloaded(): void {
    $node = $this->createIslandoraObject('Single-language object');
    $media = $this->createPlayableMedia($node, 'Single-language video');
    $this->createTranscriptMedia($node, 'en', 'single-en.vtt', 'Single English transcript');

    $this->drupalGet($media->toUrl());
    $this->ensurePlayerElement();
    $this->assertTrue($this->assertSession()->waitForText('Single English transcript'));

    $this->assertSession()->elementExists('css', '#vttLanguageControl.d-none');
    $this->assertSession()->elementTextEquals('css', '#vttDownloadBtn', 'Download transcript');
    $this->assertDownloadContains('Single English transcript');
  }

  /**
   * Tests multiple transcript languages can be selected and downloaded.
   */
  public function testMultipleLanguagesCanBeSelectedAndDownloaded(): void {
    $node = $this->createIslandoraObject('Multi-language object');
    $media = $this->createPlayableMedia($node, 'Multi-language video');
    $this->createTranscriptMedia($node, 'en', 'multi-en.vtt', 'Multi English transcript');
    $this->createTranscriptMedia($node, 'fr', 'multi-fr.vtt', 'Transcription francaise');

    $this->drupalGet($media->toUrl());
    $this->ensurePlayerElement();
    $this->assertTrue($this->assertSession()->waitForText('Multi English transcript'));

    $this->assertSession()->elementExists('css', '#vttLanguageControl:not(.d-none)');
    $this->assertSession()->fieldExists('Transcript language');

    $this->getSession()->getPage()->selectFieldOption('Transcript language', 'French');
    $this->assertTrue($this->assertSession()->waitForText('Transcription francaise'));
    $this->assertDownloadContains('Transcription francaise');
  }

  /**
   * Creates an Islandora object node.
   *
   * @param string $title
   *   The node title.
   *
   * @return \Drupal\node\Entity\Node
   *   The saved node.
   */
  protected function createIslandoraObject(string $title): Node {
    $node = Node::create([
      'type' => 'islandora_object',
      'title' => $title,
      'status' => 1,
    ]);
    $node->save();

    return $node;
  }

  /**
   * Ensures the media bundle needed by these tests exists.
   *
   * @param string $bundle
   *   The media bundle.
   */
  protected function ensureMediaBundle(string $bundle): void {
    if (MediaType::load($bundle)) {
      return;
    }

    $this->ensureMediaFileField();
    $this->ensureMediaReferenceField('field_media_of', 'node');
    $this->ensureMediaReferenceField('field_media_use', 'taxonomy_term');

    MediaType::create([
      'id' => $bundle,
      'label' => ucfirst(str_replace('_', ' ', $bundle)),
      'source' => 'file',
      'source_configuration' => [
        'source_field' => 'field_media_file',
      ],
    ])->save();

    $this->ensureBundleField($bundle, 'field_media_file', 'File', TRUE);
    $this->ensureBundleField($bundle, 'field_media_of', 'Media of', TRUE);
    $this->ensureBundleField($bundle, 'field_media_use', 'Media use');
  }

  /**
   * Ensures the edited text field expected by islandora_text_extraction exists.
   */
  protected function ensureEditedTextField(): void {
    if (!FieldStorageConfig::loadByName('media', 'field_edited_text')) {
      FieldStorageConfig::create([
        'entity_type' => 'media',
        'field_name' => 'field_edited_text',
        'type' => 'text_long',
      ])->save();
    }

    $this->ensureBundleField('extracted_text', 'field_edited_text', 'Edited text');
  }

  /**
   * Ensures the shared media file field storage exists.
   */
  protected function ensureMediaFileField(): void {
    if (FieldStorageConfig::loadByName('media', 'field_media_file')) {
      return;
    }

    FieldStorageConfig::create([
      'entity_type' => 'media',
      'field_name' => 'field_media_file',
      'type' => 'file',
      'settings' => [
        'target_type' => 'file',
      ],
    ])->save();
  }

  /**
   * Ensures a shared media entity-reference field storage exists.
   *
   * @param string $field_name
   *   The field name.
   * @param string $target_type
   *   The target entity type.
   */
  protected function ensureMediaReferenceField(string $field_name, string $target_type): void {
    if (FieldStorageConfig::loadByName('media', $field_name)) {
      return;
    }

    FieldStorageConfig::create([
      'entity_type' => 'media',
      'field_name' => $field_name,
      'type' => 'entity_reference',
      'settings' => [
        'target_type' => $target_type,
      ],
    ])->save();
  }

  /**
   * Ensures a field is attached to a media bundle.
   *
   * @param string $bundle
   *   The media bundle.
   * @param string $field_name
   *   The field name.
   * @param string $label
   *   The field label.
   * @param bool $required
   *   Whether the field is required.
   */
  protected function ensureBundleField(
    string $bundle,
    string $field_name,
    string $label,
    bool $required = FALSE,
  ): void {
    if (FieldConfig::loadByName('media', $bundle, $field_name)) {
      return;
    }

    FieldConfig::create([
      'entity_type' => 'media',
      'bundle' => $bundle,
      'field_name' => $field_name,
      'label' => $label,
      'required' => $required,
    ])->save();
  }

  /**
   * Creates media that renders the transcript viewer.
   *
   * @param \Drupal\node\Entity\Node $node
   *   The Islandora object node.
   * @param string $name
   *   The media name.
   *
   * @return \Drupal\media\Entity\Media
   *   The saved media.
   */
  protected function createPlayableMedia(Node $node, string $name): Media {
    $file = $this->createManagedFile('video-fixture.mp4', 'video fixture');
    $values = [
      'bundle' => 'video',
      'name' => $name,
      'status' => 1,
      'field_media_of' => [
        'target_id' => $node->id(),
      ],
    ];

    $source_field = $this->getMediaSourceField('video');
    if ($source_field) {
      $values[$source_field] = [
        'target_id' => $file->id(),
      ];
    }

    $media = Media::create($values);
    $media->save();

    return $media;
  }

  /**
   * Creates extracted text media for a node.
   *
   * @param \Drupal\node\Entity\Node $node
   *   The Islandora object node.
   * @param string $langcode
   *   The media language.
   * @param string $filename
   *   The VTT file name.
   * @param string $cue_text
   *   The cue text.
   *
   * @return \Drupal\media\Entity\Media
   *   The saved media.
   */
  protected function createTranscriptMedia(Node $node, string $langcode, string $filename, string $cue_text): Media {
    $file = $this->createManagedFile($filename, $this->buildVtt($cue_text));
    $values = [
      'bundle' => 'extracted_text',
      'name' => $filename,
      'langcode' => $langcode,
      'status' => 1,
      'field_media_file' => [
        'target_id' => $file->id(),
      ],
      'field_media_of' => [
        'target_id' => $node->id(),
      ],
      'field_media_use' => [
        'target_id' => $this->extractedTextTid,
      ],
      'field_edited_text' => [
        'value' => $cue_text,
      ],
    ];

    $media = Media::create($values);
    $media->save();

    return $media;
  }

  /**
   * Creates a managed public file.
   *
   * @param string $filename
   *   The filename.
   * @param string $contents
   *   The file contents.
   *
   * @return \Drupal\file\Entity\File
   *   The saved file.
   */
  protected function createManagedFile(string $filename, string $contents): File {
    $directory = 'public://islandora-vtt-test';
    $this->container->get('file_system')->prepareDirectory(
      $directory,
      FileSystemInterface::CREATE_DIRECTORY | FileSystemInterface::MODIFY_PERMISSIONS
    );
    $uri = $directory . '/' . $filename;
    file_put_contents($uri, $contents);

    $file = File::create([
      'uri' => $uri,
      'filename' => $filename,
      'status' => 1,
    ]);
    $file->save();

    return $file;
  }

  /**
   * Builds a minimal VTT file.
   *
   * @param string $cue_text
   *   The cue text.
   *
   * @return string
   *   The VTT contents.
   */
  protected function buildVtt(string $cue_text): string {
    return "WEBVTT\n\n00:00:00.000 --> 00:00:02.000\n{$cue_text}\n";
  }

  /**
   * Gets the source field for a media type.
   *
   * @param string $bundle
   *   The media bundle.
   *
   * @return string|null
   *   The source field name, if available.
   */
  protected function getMediaSourceField(string $bundle): ?string {
    $media_type = MediaType::load($bundle);
    if (!$media_type) {
      return NULL;
    }

    $configuration = $media_type->getSource()->getConfiguration();
    return $configuration['source_field'] ?? NULL;
  }

  /**
   * Gets the Extracted Text media-use term ID.
   *
   * @return int
   *   The term ID.
   */
  protected function getExtractedTextTid(): int {
    $terms = $this->container->get('entity_type.manager')
      ->getStorage('taxonomy_term')
      ->loadByProperties([
        'vid' => 'islandora_media_use',
        'name' => 'Extracted Text',
      ]);

    if ($term = reset($terms)) {
      return (int) $term->id();
    }

    $term = Term::create([
      'vid' => 'islandora_media_use',
      'name' => 'Extracted Text',
    ]);
    $term->save();

    return (int) $term->id();
  }

  /**
   * Adds a player element if the media display does not render one.
   */
  protected function ensurePlayerElement(): void {
    $this->getSession()->executeScript(<<<'JS'
      if (!document.querySelector('video')) {
        document.body.insertAdjacentHTML('afterbegin', '<video controls></video>');
      }
    JS);
  }

  /**
   * Asserts the active download link serves the expected VTT text.
   *
   * @param string $expected
   *   Expected text from the VTT file.
   */
  protected function assertDownloadContains(string $expected): void {
    $href = $this->getSession()->evaluateScript("document.getElementById('vttDownloadBtn').href");
    $this->assertNotEmpty($href);

    $this->drupalGet($href);
    $this->assertSession()->pageTextContains($expected);
  }

}

<?php

namespace Drupal\islandora_vtt\Hook;

use Drupal\Core\Cache\CacheableMetadata;
use Drupal\Core\File\FileUrlGeneratorInterface;
use Drupal\Core\Hook\Attribute\Hook;

/**
 * Hook implementations for islandora_vtt.
 */
class IslandoraVttHooks {

  /**
   * Implements hook_theme().
   */
  #[Hook('theme')]
  public static function theme($existing, $type, $theme, $path) {
    return [
      'vtt_transcript' => [
        'variables' => [],
        'template' => 'vtt-transcript',
        'path' => $path . '/templates',
      ],
    ];
  }

  /**
   * Implements hook_preprocess_media().
   */
  #[Hook('preprocess_media')]
  public static function preprocessMedia(&$vars) {
    if (!in_array($vars['view_mode'], [
      'full',
      'default',
      'default_islandora_display',
    ])) {
      return;
    }
    $media = $vars['media'];
    if (empty($media) || !in_array($media->bundle(), [
      'audio',
      'video',
    ])) {
      return;
    }
    $vtt_files = islandora_vtt_get_vtt_file_rows($media);
    if (empty($vtt_files)) {
      return;
    }
    $transcripts = [];
    $cacheability = CacheableMetadata::createFromObject($media);
    $node = \Drupal::routeMatch()->getParameter('node');
    if (is_object($node)) {
      $cacheability->addCacheableDependency($node);
    }
    elseif (!$media->field_media_of->isEmpty() && $media->field_media_of->entity) {
      $cacheability->addCacheableDependency($media->field_media_of->entity);
    }
    $language_manager = \Drupal::languageManager();
    $file_url_generator = \Drupal::service('file_url_generator');
    $media_storage = \Drupal::entityTypeManager()->getStorage('media');
    $file_storage = \Drupal::entityTypeManager()->getStorage('file');
    foreach ($vtt_files as $vtt_file) {
      $vtt = $media_storage->load($vtt_file->mid);
      $file = $file_storage->load($vtt_file->fid);
      if (!$vtt) {
        continue;
      }
      $cacheability
        ->addCacheableDependency($vtt);
      if ($file) {
        $cacheability->addCacheableDependency($file);
      }
      $langcode = $vtt_file->langcode;
      $language = $language_manager->getLanguage($langcode);
      $label = $language ? $language->getName() : $langcode;
      $filename = $vtt_file->filename ?: ('transcript-' . $langcode . '.vtt');
      if (!preg_match('/\.vtt$/i', $filename)) {
        $filename = preg_replace('/\.[^.]+$/', '', $filename) . '.vtt';
      }
      $transcripts[] = [
        'id' => $vtt_file->mid,
        'url' => static::buildTranscriptFileUrl($vtt_file->uri, $file_url_generator),
        'fileUri' => $vtt_file->uri,
        'langcode' => $langcode,
        'label' => $label,
        'filename' => $filename,
      ];
    }
    if (empty($transcripts)) {
      return;
    }
    $vars['content']['vtt'] = [
      '#theme' => 'vtt_transcript',
      '#weight' => 100,
    ];
    $vars['#attached']['library'][] = 'islandora_vtt/vtt';
    $vars['#attached']['drupalSettings']['vttTranscripts'] = $transcripts;
    $vars['#attached']['drupalSettings']['vttPlayerType'] = $media->bundle();
    $cacheability->applyTo($vars);
  }

  /**
   * Builds the browser URL for a transcript file URI.
   *
   * @param string $file_uri
   *   The file entity URI.
   * @param \Drupal\Core\File\FileUrlGeneratorInterface $file_url_generator
   *   The file URL generator service.
   *
   * @return string
   *   The absolute browser URL.
   */
  protected static function buildTranscriptFileUrl(
    string $file_uri,
    FileUrlGeneratorInterface $file_url_generator,
  ): string {
    if (str_starts_with($file_uri, 'private://')) {
      $path = substr($file_uri, strlen('private://'));
      $path = implode('/', array_map('rawurlencode', explode('/', $path)));
      $base_path = rtrim(\Drupal::request()->getBasePath(), '/');

      return \Drupal::request()->getSchemeAndHttpHost() . $base_path . '/system/files/' . $path;
    }

    return $file_url_generator->generateAbsoluteString($file_uri);
  }

}

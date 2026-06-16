<?php

namespace Drupal\islandora_vtt\Hook;

use Drupal\media\Entity\Media;
use Drupal\Core\Hook\Attribute\Hook;
/**
 * Hook implementations for islandora_vtt.
 */
class IslandoraVttHooks
{
    /**
     * Implements hook_theme().
     */
    #[Hook('theme')]
    public static function theme($existing, $type, $theme, $path)
    {
        return [
            'vtt_transcript' => [
                'variables' => [
                ],
                'template' => 'vtt-transcript',
                'path' => $path . '/templates',
            ],
        ];
    }
    /**
     * Implements hook_preprocess_media().
     */
    #[Hook('preprocess_media')]
    public static function preprocessMedia(&$vars)
    {
        if (!in_array($vars['view_mode'], [
            'full',
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
        $vtt = islandora_vtt_get_vtt($media);
        if (!$vtt) {
            return;
        }
        $vars['content']['vtt'] = [
            '#theme' => 'vtt_transcript',
            '#weight' => 100,
        ];
        $vars['#attached']['library'][] = 'islandora_vtt/vtt';
        $vars['#attached']['drupalSettings']['vttUrl'] = $vtt->field_media_file->entity->createFileUrl();
        $vars['#attached']['drupalSettings']['vttPlayerType'] = $media->bundle();
    }
}

<?php

namespace Drupal\islandora_vtt_test\Controller;

use Drupal\Core\Controller\ControllerBase;
use Drupal\media\MediaInterface;

/**
 * Provides test routes for Islandora VTT.
 */
class IslandoraVttTestController extends ControllerBase {

  /**
   * Renders a media entity in full mode.
   *
   * @param \Drupal\media\MediaInterface $media
   *   The media entity.
   *
   * @return array
   *   A render array.
   */
  public function media(MediaInterface $media): array {
    return $this->entityTypeManager()
      ->getViewBuilder('media')
      ->view($media, 'full');
  }

}

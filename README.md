# Islandora VTT

Support generating and displaying VTT files for audio and video

## Install

This module can be installed on your site using the typical Drupal install process

```
composer require drupal/islandora_vtt
drush en islandora_vtt
```

### Update Islandora Contexts

Update your audio and video derivative contexts at `/admin/structure/context` to also trigger the `Create VTT file from Audio or Video` action.

### Deploy microservice

In order to have the VTT files generated, you'll need to have the scyllaridae OpenAI Whisper microservice available in your stack.

#### docker-compose

Add the microservice to your docker compose

```
    whisper-dev: &whisper
        <<: [*dev, *common]
        image: lehighlts/scyllaridae-whisper:main
        networks:
            default:
                aliases:
                    - whisper
    whisper-prod:
        <<: [*prod, *whisper]
```

#### kubernetes

See [service/deployment manifest in scyllaridae repo](https://github.com/lehigh-university-libraries/scyllaridae/blob/main/ci/k8s/whisper.yaml)


### Configure alpaca

You'll also need to add `whisper` to `derivative.systems.installed` in your `alpaca.properties` by adding that string to the `ALPACA_DERIVATIVE_SYSTEMS` environment variable in your alpaca service.

```
ALPACA_DERIVATIVE_SYSTEMS=whisper
```

You'll also need to define the service in alpaca.properties.tmpl

```
derivative.whisper.enabled=true
derivative.whisper.in.stream=queue:islandora-connector-whisper
# this url may be different if deploying via kubernetes
derivative.whisper.service.url=http://whisper:8080
derivative.whisper.concurrent-consumers=1
derivative.whisper.max-concurrent-consumers=-1
derivative.whisper.async-consumer=true
```

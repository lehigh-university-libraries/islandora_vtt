(function ($, Drupal, drupalSettings) {
    Drupal.behaviors.islandoraVtt = {
      cues: [],
      currentSearchIndex: 0,
      searchResults: [],
      attach: function (context, settings) {
        function isValidString(inputString) {
          return /^[A-Za-z0-9-_"' ?]+$/.test(inputString);
        }
  
        $(once('vtt-search', 'body')).on('keypress', function(e) {
          if (e.key === " ") {
            const player = document.querySelector(drupalSettings.vttPlayerType);
            if (player.paused) {
              player.play().catch((error) => {
                console.error('Audio playback failed:', error);
              });
            } else {
              player.pause();
            }
          }
        })
        $(once('vtt-pager', '#prevBtn, #nextBtn')).on('click', function() {
          if ($(this).attr('id') == 'prevBtn') {
            Drupal.behaviors.islandoraVtt.navigateSearchResults(-1)
          } else {
            Drupal.behaviors.islandoraVtt.navigateSearchResults(1)
          }
        });
        $(once('vtt-search', '#searchInput')).on('keypress', function(e) {
          if (e.key === "Enter") {
            Drupal.behaviors.islandoraVtt.searchTranscript();
          }
        });
        $(once('vtt-search-btn', '#vtt-search-btn')).on('click', function() {
          Drupal.behaviors.islandoraVtt.searchTranscript();
        });
        const fetchVTT = async () => {
          for (let i = 0; i < 5; i++) {
            try {
              const response = await fetch(drupalSettings.vttUrl);
              if (!response.ok) throw new Error('Failed to fetch VTT file');
              const vttText = await response.text();
              const player = document.querySelector(drupalSettings.vttPlayerType);
              if (!player) throw new Error('Player element not found');

              this.parseVTT(vttText);
              this.createTranscript();

              player.addEventListener('timeupdate', () => {
                this.highlightCue();
              });

              var s = Drupal.behaviors.lehighNode.getQueryParam('search_api_fulltext');
              if (s != null && s != "" && isValidString(s) && vttText.toLowerCase().includes(s.toLowerCase())) {
                $('#searchInput').attr('value', s);
                $('#vtt-search-btn').click();
                const player = document.querySelector(drupalSettings.vttPlayerType);
                player.pause();
              }
              $('#block-views-block-item-title-title-area .internal-links').append('<a href="#transcript">Transcript</a>')
              break;
            } catch (error) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        };
  
        // Automatically fetch VTT when behavior is attached
        fetchVTT();
      },
  
      // Make parseVTT callable from outside
      parseVTT: function (vtt) {
        let cue = {}
        const lines = vtt.split('\n').filter(line => line.trim() !== 'WEBVTT'); // Skip the WEBVTT line  
        lines.forEach(line => {
          if (line.includes('-->')) {
            const [start, end] = line.split(' --> ');
            cue.start = this.parseTime(start);
            cue.end = this.parseTime(end);
          } else if (line.trim()) {
            cue.text = line;
            this.cues.push({ ...cue });
            cue = {};
          }
        });
      },
  
      parseTime: function (timeString) {
        const parts = timeString.split(':');
        return (
          parseInt(parts[0], 10) * 3600 +
          parseInt(parts[1], 10) * 60 +
          parseFloat(parts[2])
        );
      },
  
      createTranscript: function () {
        const transcriptBox = document.getElementById('transcriptBox');
        transcriptBox.innerHTML = '';
        this.cues.forEach((cue, index) => {
          const cueElement = document.createElement('div');
          cueElement.classList.add('cue');
          cueElement.innerHTML = `
            <a href="#" data-start="${cue.start}">
              ${this.formatTime(cue.start)}
            </a>
            <span>${cue.text}</span>
          `;
          cueElement.id = `cue-${index}`;
          transcriptBox.appendChild(cueElement);
        });

        $("a[data-start]").on('click', function() {
          const start=$(this).attr('data-start');
          Drupal.behaviors.islandoraVtt.jumpTo(start);
        });
      },
  
      formatTime: function (time) {
        const minutes = Math.floor(time / 60);
        const seconds = Math.floor(time % 60);
        return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
      },
  
      jumpTo: function (time) {
        const player = document.querySelector(drupalSettings.vttPlayerType);
        player.currentTime = time;
        if (player.paused) {
          player.play().catch((error) => {
            console.error('Audio playback failed:', error);
          });
        }
        return false;
      },
  
      highlightCue: function () {
        const player = document.querySelector(drupalSettings.vttPlayerType);
        const currentTime = player.currentTime;
        this.cues.forEach((cue, index) => {
          const cueElement = document.getElementById(`cue-${index}`);
          if (currentTime >= cue.start && currentTime <= cue.end) {
            cueElement.classList.add('highlight');
            cueElement.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
          } else {
            cueElement.classList.remove('highlight');
          }
        });
      },
  
      searchTranscript: function () {
        const searchInput = document.getElementById('searchInput').value.toLowerCase();
        const cueElements = document.querySelectorAll('.cue');
        const player = document.querySelector(drupalSettings.vttPlayerType);

        // Clear previous highlights and search results
        cueElements.forEach((cue) => {
          cue.querySelector('span').innerHTML = cue.querySelector('span').textContent; // Remove previous highlights
        });
  
        // Find and highlight matching text
        cueElements.forEach((cue, index) => {
          const text = cue.querySelector('span').textContent.toLowerCase();
          if (text.includes(searchInput)) {
            this.searchResults.push({ cueIndex: index, searchTerm: searchInput });
          }
        });
  
        if (this.searchResults.length > 0) {
            this.updateSearchResult();
            document.getElementById('nextBtn').disabled = this.searchResults.length <= 1;
            document.getElementById('prevBtn').disabled = this.currentSearchIndex == 0;
            if (player.paused) {
                player.play().catch(error => {
                    console.error('Playback failed:', error);
                });
            }
        } else {
            document.getElementById('pagerInfo').textContent = '0 of 0 results';
            document.getElementById('nextBtn').disabled = true;
            document.getElementById('prevBtn').disabled = true;
        }
      },
  
      updateSearchResult: function () {
        const cueElements = document.querySelectorAll('.cue');
 
        // Clear all previous highlights
        cueElements.forEach((cue) => {
          cue.querySelector('span').innerHTML = cue.querySelector('span').textContent;
        });
  
        // Highlight the current search result
        const { cueIndex, searchTerm } = this.searchResults[this.currentSearchIndex];
        const cueElement = document.getElementById(`cue-${cueIndex}`);
        const cueText = cueElement.querySelector('span').textContent;
  
        // Highlight the matching word(s) in the text
        const regex = new RegExp(`(${searchTerm})`, 'gi');
        const highlightedText = cueText.replace(regex, '<mark>$1</mark>');
        cueElement.querySelector('span').innerHTML = highlightedText;
  
        cueElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
  
        // Skip audio to the start of the corresponding cue
        this.jumpTo(this.cues[cueIndex].start);

        document.getElementById('nextBtn').disabled = this.searchResults.length == (this.currentSearchIndex+1);
        document.getElementById('prevBtn').disabled = this.currentSearchIndex == 0 && this.searchResults.length > 0;

        document.getElementById('pagerInfo').textContent = `${this.currentSearchIndex + 1} of ${this.searchResults.length} results`;
      },
  
      navigateSearchResults: function (direction) { 
        this.currentSearchIndex += direction;
  
        // Bound the index within the search results
        if (this.currentSearchIndex < 0) {
          this.currentSearchIndex = 0;
        } else if (this.currentSearchIndex >= this.searchResults.length) {
          this.currentSearchIndex = this.searchResults.length - 1;
        }
  
        // Update the view and jump audio to the result
        this.updateSearchResult();
      }
    };
})(jQuery, Drupal, drupalSettings);

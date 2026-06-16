(function ($, Drupal, drupalSettings) {
  Drupal.behaviors.islandoraVtt = {
    cues: [],
    currentSearchIndex: 0,
    searchResults: [],
    currentTranscript: null,
    currentVttText: '',

    attach: function (context) {
      const transcripts = drupalSettings.vttTranscripts || [];

      if (!transcripts.length) {
        return;
      }

      if (!once('vtt-transcript-root', '#transcript', context).length) {
        return;
      }

      $(once('vtt-search-shortcut', 'body')).on('keypress', (e) => {
        if (e.key !== ' ' || ['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(e.target.tagName)) {
          return;
        }
        const player = this.getPlayer();
        if (!player) {
          return;
        }
        if (player.paused) {
          player.play().catch((error) => {
            console.error('Audio playback failed:', error);
          });
        }
        else {
          player.pause();
        }
      });

      $(once('vtt-pager', '#prevBtn, #nextBtn', context)).on('click', (e) => {
        if ($(e.currentTarget).attr('id') === 'prevBtn') {
          this.navigateSearchResults(-1);
        }
        else {
          this.navigateSearchResults(1);
        }
      });

      $(once('vtt-search-input', '#searchInput', context)).on('keypress', (e) => {
        if (e.key === 'Enter') {
          this.searchTranscript();
        }
      });

      $(once('vtt-search-btn', '#vtt-search-btn', context)).on('click', () => {
        this.searchTranscript();
      });

      $(once('vtt-language-select', '#vttLanguageSelect', context)).on('change', (e) => {
        const selected = transcripts.find((transcript) => String(transcript.id) === e.target.value);
        if (selected) {
          this.loadTranscript(selected);
        }
      });

      this.buildLanguageControl(transcripts);
      this.loadTranscript(transcripts[0]);
    },

    buildLanguageControl: function (transcripts) {
      const languageControl = document.getElementById('vttLanguageControl');
      const languageSelect = document.getElementById('vttLanguageSelect');
      if (!languageControl || !languageSelect) {
        return;
      }

      languageSelect.innerHTML = '';
      transcripts.forEach((transcript, index) => {
        const option = document.createElement('option');
        option.value = String(transcript.id || index);
        option.textContent = transcript.label || transcript.langcode || 'Transcript';
        languageSelect.appendChild(option);
        transcript.id = option.value;
      });

      languageControl.classList.toggle('d-none', transcripts.length <= 1);
    },

    loadTranscript: async function (transcript) {
      this.currentTranscript = transcript;
      this.resetState();
      this.updateDownloadLink(transcript);

      for (let i = 0; i < 5; i++) {
        try {
          const response = await fetch(transcript.url);
          if (!response.ok) {
            throw new Error('Failed to fetch VTT file');
          }

          this.currentVttText = await response.text();
          const player = this.getPlayer();
          if (!player) {
            throw new Error('Player element not found');
          }

          this.parseVTT(this.currentVttText);
          this.createTranscript();
          this.attachPlayerHighlight(player);
          this.applyInitialSearch();
          this.addTranscriptAnchor();
          break;
        }
        catch (error) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      }
    },

    resetState: function () {
      this.cues = [];
      this.searchResults = [];
      this.currentSearchIndex = 0;
      this.currentVttText = '';

      const transcriptBox = document.getElementById('transcriptBox');
      if (transcriptBox) {
        transcriptBox.innerHTML = '';
      }
      const pagerInfo = document.getElementById('pagerInfo');
      if (pagerInfo) {
        pagerInfo.textContent = '';
      }
      const nextBtn = document.getElementById('nextBtn');
      const prevBtn = document.getElementById('prevBtn');
      if (nextBtn) {
        nextBtn.disabled = true;
      }
      if (prevBtn) {
        prevBtn.disabled = true;
      }
    },

    updateDownloadLink: function (transcript) {
      const downloadBtn = document.getElementById('vttDownloadBtn');
      if (!downloadBtn) {
        return;
      }

      downloadBtn.href = transcript.url;
      downloadBtn.download = transcript.filename || `${transcript.langcode || 'transcript'}.vtt`;
    },

    attachPlayerHighlight: function (player) {
      if (player.dataset.vttTimeupdateAttached) {
        return;
      }
      player.dataset.vttTimeupdateAttached = 'true';
      player.addEventListener('timeupdate', () => {
        this.highlightCue();
      });
    },

    applyInitialSearch: function () {
      if (!Drupal.behaviors.lehighNode || !Drupal.behaviors.lehighNode.getQueryParam) {
        return;
      }

      const searchValue = Drupal.behaviors.lehighNode.getQueryParam('search_api_fulltext');
      if (searchValue && this.isValidString(searchValue) && this.currentVttText.toLowerCase().includes(searchValue.toLowerCase())) {
        $('#searchInput').val(searchValue);
        this.searchTranscript();
        const player = this.getPlayer();
        if (player) {
          player.pause();
        }
      }
    },

    addTranscriptAnchor: function () {
      const internalLinks = $('#block-views-block-item-title-title-area .internal-links');
      if (internalLinks.length && !internalLinks.find('a[href="#transcript"]').length) {
        internalLinks.append('<a href="#transcript">Transcript</a>');
      }
    },

    isValidString: function (inputString) {
      return /^[A-Za-z0-9-_"' ?]+$/.test(inputString);
    },

    getPlayer: function () {
      return document.querySelector(drupalSettings.vttPlayerType);
    },

    parseVTT: function (vtt) {
      let cue = {};
      const lines = vtt.split('\n').filter((line) => line.trim() !== 'WEBVTT');
      lines.forEach((line) => {
        if (line.includes('-->')) {
          const [start, end] = line.split(' --> ');
          cue.start = this.parseTime(start);
          cue.end = this.parseTime(end);
          cue.text = '';
        }
        else if (line.trim() && cue.start !== undefined) {
          cue.text = cue.text ? `${cue.text}\n${line}` : line;
        }
        else if (!line.trim() && cue.start !== undefined && cue.text) {
          this.cues.push({ ...cue });
          cue = {};
        }
      });

      if (cue.start !== undefined && cue.text) {
        this.cues.push({ ...cue });
      }
    },

    parseTime: function (timeString) {
      const parts = timeString.trim().split(':');
      return (
        parseInt(parts[0], 10) * 3600 +
        parseInt(parts[1], 10) * 60 +
        parseFloat(parts[2])
      );
    },

    createTranscript: function () {
      const transcriptBox = document.getElementById('transcriptBox');
      if (!transcriptBox) {
        return;
      }

      transcriptBox.innerHTML = '';
      this.cues.forEach((cue, index) => {
        const cueElement = document.createElement('div');
        cueElement.classList.add('cue');
        cueElement.id = `cue-${index}`;

        const link = document.createElement('a');
        link.href = '#';
        link.dataset.start = cue.start;
        link.textContent = this.formatTime(cue.start);

        const text = document.createElement('span');
        text.textContent = cue.text;

        cueElement.appendChild(link);
        cueElement.appendChild(text);
        transcriptBox.appendChild(cueElement);
      });

      $('a[data-start]').off('click.islandoraVtt').on('click.islandoraVtt', (e) => {
        e.preventDefault();
        this.jumpTo($(e.currentTarget).attr('data-start'));
      });
    },

    formatTime: function (time) {
      const minutes = Math.floor(time / 60);
      const seconds = Math.floor(time % 60);
      return `${minutes}:${seconds < 10 ? '0' : ''}${seconds}`;
    },

    jumpTo: function (time) {
      const player = this.getPlayer();
      if (!player) {
        return false;
      }
      player.currentTime = time;
      if (player.paused) {
        player.play().catch((error) => {
          console.error('Audio playback failed:', error);
        });
      }
      return false;
    },

    highlightCue: function () {
      const player = this.getPlayer();
      const transcriptBox = document.getElementById('transcriptBox');
      if (!player || !transcriptBox) {
        return;
      }

      const currentTime = player.currentTime;
      this.cues.forEach((cue, index) => {
        const cueElement = document.getElementById(`cue-${index}`);
        if (!cueElement) {
          return;
        }
        if (currentTime >= cue.start && currentTime <= cue.end) {
          cueElement.classList.add('highlight');
          transcriptBox.scrollTo({
            top: cueElement.offsetTop - transcriptBox.offsetTop,
            behavior: 'smooth'
          });
        }
        else {
          cueElement.classList.remove('highlight');
        }
      });
    },

    searchTranscript: function () {
      const searchInput = document.getElementById('searchInput').value.toLowerCase();
      const cueElements = document.querySelectorAll('.cue');
      const player = this.getPlayer();

      this.searchResults = [];
      this.currentSearchIndex = 0;
      cueElements.forEach((cue) => {
        cue.querySelector('span').textContent = cue.querySelector('span').textContent;
      });

      cueElements.forEach((cue, index) => {
        const text = cue.querySelector('span').textContent.toLowerCase();
        if (searchInput && text.includes(searchInput)) {
          this.searchResults.push({ cueIndex: index, searchTerm: searchInput });
        }
      });

      if (this.searchResults.length > 0) {
        this.updateSearchResult();
        document.getElementById('nextBtn').disabled = this.searchResults.length <= 1;
        document.getElementById('prevBtn').disabled = this.currentSearchIndex === 0;
        if (player && player.paused) {
          player.play().catch((error) => {
            console.error('Playback failed:', error);
          });
        }
      }
      else {
        document.getElementById('pagerInfo').textContent = '0 of 0 results';
        document.getElementById('nextBtn').disabled = true;
        document.getElementById('prevBtn').disabled = true;
      }
    },

    updateSearchResult: function () {
      const cueElements = document.querySelectorAll('.cue');
      cueElements.forEach((cue) => {
        cue.querySelector('span').textContent = cue.querySelector('span').textContent;
      });

      const { cueIndex, searchTerm } = this.searchResults[this.currentSearchIndex];
      const cueElement = document.getElementById(`cue-${cueIndex}`);
      const textElement = cueElement.querySelector('span');
      const cueText = textElement.textContent;
      this.highlightText(textElement, cueText, searchTerm);

      cueElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
      this.jumpTo(this.cues[cueIndex].start);

      document.getElementById('nextBtn').disabled = this.searchResults.length === (this.currentSearchIndex + 1);
      document.getElementById('prevBtn').disabled = this.currentSearchIndex === 0 && this.searchResults.length > 0;
      document.getElementById('pagerInfo').textContent = `${this.currentSearchIndex + 1} of ${this.searchResults.length} results`;
    },

    escapeRegExp: function (string) {
      return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    },

    highlightText: function (element, text, searchTerm) {
      const fragment = document.createDocumentFragment();
      const regex = new RegExp(this.escapeRegExp(searchTerm), 'gi');
      let lastIndex = 0;
      let match;

      while ((match = regex.exec(text)) !== null) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        const mark = document.createElement('mark');
        mark.textContent = match[0];
        fragment.appendChild(mark);
        lastIndex = match.index + match[0].length;
      }

      fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      element.replaceChildren(fragment);
    },

    navigateSearchResults: function (direction) {
      this.currentSearchIndex += direction;

      if (this.currentSearchIndex < 0) {
        this.currentSearchIndex = 0;
      }
      else if (this.currentSearchIndex >= this.searchResults.length) {
        this.currentSearchIndex = this.searchResults.length - 1;
      }

      this.updateSearchResult();
    }
  };
})(jQuery, Drupal, drupalSettings);

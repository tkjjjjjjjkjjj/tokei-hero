(function (globalObject) {
  'use strict';

  const ROUND_SIZE = 6;
  const KEY = 'clockHeroProgressV1';
  const LEVELS = {
    easy: { minutes: [0] },
    medium: { minutes: [0, 30] },
    challenge: { minutes: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] },
  };
  const STICKERS = [
    ['⭐', 'キラキラぼし'],
    ['🌈', 'にじ'],
    ['🚀', 'ロケット'],
    ['🦖', 'きょうりゅう'],
    ['🐳', 'くじら'],
    ['🦄', 'ユニコーン'],
    ['🍓', 'いちご'],
    ['👑', 'おうかん'],
    ['🐙', 'たこ'],
    ['🛸', 'UFO'],
    ['🐼', 'パンダ'],
    ['💎', 'ダイヤ'],
  ];

  const core = {
    handAngles: (hour, minute) => ({
      hour: (hour % 12) * 30 + minute * 0.5,
      minute: minute * 6,
    }),

    formatTime: (hour, minute) =>
      minute === 0 ? `${hour}じ` : `${hour}じ ${minute}ふん`,

    digitalTime: (hour, minute) => `${hour}:${String(minute).padStart(2, '0')}`,

    generateQuestion(level, previousKey, random = Math.random) {
      const minutes = (LEVELS[level] || LEVELS.easy).minutes;
      let hour;
      let minute;
      let key;
      let attempts = 0;

      do {
        hour = 1 + Math.floor(random() * 12);
        minute = minutes[Math.floor(random() * minutes.length)];
        key = `${hour}:${minute}`;
        attempts++;
      } while (key === previousKey && attempts < 12);

      return { hour, minute, key };
    },

    makeChoices(question, level) {
      const choices = new Set([this.formatTime(question.hour, question.minute)]);
      const addChoice = (hour, minute) => {
        const wrappedHour = ((hour - 1 + 12) % 12) + 1;
        choices.add(this.formatTime(wrappedHour, minute));
      };

      if (level !== 'easy') {
        const alternativeMinutes = LEVELS[level].minutes.filter(
          (minute) => minute !== question.minute,
        );
        const nearestMinute = alternativeMinutes.reduce(
          (nearest, minute) =>
            Math.abs(minute - question.minute) < Math.abs(nearest - question.minute)
              ? minute
              : nearest,
          alternativeMinutes[0],
        );
        addChoice(question.hour, nearestMinute);
      }

      addChoice(question.hour + 1, question.minute);
      addChoice(question.hour - 1, question.minute);

      let fallbackMinute =
        level === 'challenge' ? (question.minute + 15) % 60 : question.minute === 0 ? 30 : 0;
      while (choices.size < 3) {
        addChoice(question.hour + choices.size, fallbackMinute);
        fallbackMinute = (fallbackMinute + 10) % 60;
      }

      return [...choices].slice(0, 3);
    },

    starCount: (firstTryCorrect) => (firstTryCorrect >= 6 ? 3 : firstTryCorrect >= 4 ? 2 : 1),
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { core, LEVELS, STICKERS, ROUND_SIZE };
  }
  if (typeof document === 'undefined') return;

  const SCREEN_IDS = ['homeScreen', 'gameScreen', 'resultScreen', 'stickerScreen'];
  const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';
  const CONFETTI_COLORS = ['#ff6b9f', '#ffd93d', '#6ee7b7', '#74c0fc', '#9b87f5', '#ff8e53'];

  const getElement = (id) => document.getElementById(id);

  const state = {
    level: 'easy',
    round: 0,
    first: 0,
    combo: 0,
    max: 0,
    prev: '',
    q: null,
    wrong: false,
    locked: false,
    sound: true,
  };

  let progress = { stickers: [], bestCombo: 0, plays: 0 };
  try {
    progress = { ...progress, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch (_) {}

  const saveProgress = () => {
    try {
      localStorage.setItem(KEY, JSON.stringify(progress));
    } catch (_) {}
  };

  function showScreen(screenId) {
    SCREEN_IDS.forEach((id) => {
      getElement(id).classList.toggle('active', id === screenId);
    });
    getElement('homeButton').classList.toggle('hidden', screenId === 'homeScreen');
  }

  function renderHomeStats() {
    getElement('stickerCount').textContent = `${progress.stickers.length} / ${STICKERS.length}`;
    getElement('bestCombo').textContent = String(progress.bestCombo);
  }

  function createClockTicks() {
    const tickContainer = getElement('tickMarks');

    for (let index = 0; index < 60; index++) {
      const tick = document.createElementNS(SVG_NAMESPACE, 'line');
      const isMajorTick = index % 5 === 0;
      const attributes = [
        ['x1', '100'],
        ['y1', isMajorTick ? '18' : '20'],
        ['x2', '100'],
        ['y2', isMajorTick ? '29' : '25'],
        ['transform', `rotate(${index * 6} 100 100)`],
        ['class', isMajorTick ? 'tick major' : 'tick'],
      ];

      attributes.forEach(([name, value]) => tick.setAttribute(name, value));
      tickContainer.appendChild(tick);
    }
  }

  function setClock(hour, minute) {
    const angles = core.handAngles(hour, minute);
    getElement('hourHand').style.transform = `rotate(${angles.hour}deg)`;
    getElement('minuteHand').style.transform = `rotate(${angles.minute}deg)`;
  }

  function shuffle(items) {
    const shuffled = [...items];
    for (let index = shuffled.length - 1; index; index--) {
      const randomIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
    }
    return shuffled;
  }

  function startGame(level) {
    Object.assign(state, {
      level,
      round: 0,
      first: 0,
      combo: 0,
      max: 0,
      prev: '',
      locked: false,
    });
    showScreen('gameScreen');
    showNextQuestion();
  }

  function resetQuestionVisuals() {
    getElement('feedback').textContent = '';
    getElement('feedback').className = 'feedback';
    getElement('hintBubble').classList.add('hidden');
    getElement('clockCard').classList.remove('correct-pop', 'wrong-shake');
  }

  function showNextQuestion() {
    state.round++;
    state.wrong = false;
    state.locked = false;
    state.q = core.generateQuestion(state.level, state.prev);
    state.prev = state.q.key;

    getElement('roundLabel').textContent = `${state.round} / ${ROUND_SIZE}`;
    getElement('questionText').textContent = state.level === 'easy' ? 'なんじ？' : 'なんじ なんぷん？';
    getElement('progressBar').style.width = `${((state.round - 1) / ROUND_SIZE) * 100}%`;

    resetQuestionVisuals();
    setClock(state.q.hour, state.q.minute);
    renderChoices();
    renderHud();
  }

  function renderChoices() {
    const target = core.formatTime(state.q.hour, state.q.minute);
    const answerGrid = getElement('answerGrid');
    answerGrid.innerHTML = '';

    shuffle(core.makeChoices(state.q, state.level)).forEach((choice) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'answer-button';
      button.textContent = choice;
      button.onclick = () => handleAnswer(choice, target, button);
      answerGrid.appendChild(button);
    });
  }

  function handleCorrectAnswer(button) {
    state.locked = true;
    if (!state.wrong) state.first++;
    state.combo++;
    state.max = Math.max(state.max, state.combo);

    button.classList.add('correct');
    document.querySelectorAll('.answer-button').forEach((answerButton) => {
      answerButton.disabled = true;
    });

    getElement('feedback').className = 'feedback good';
    getElement('feedback').textContent = `ピンポーン！ ${core.digitalTime(state.q.hour, state.q.minute)} ✨`;
    getElement('progressBar').style.width = `${(state.round / ROUND_SIZE) * 100}%`;

    celebrate();
    playSuccessSound();
    speakCurrentTime();
    renderHud();

    setTimeout(() => (state.round >= ROUND_SIZE ? finishGame() : showNextQuestion()), 720);
  }

  function handleWrongAnswer(button) {
    state.wrong = true;
    state.combo = 0;
    button.disabled = true;
    button.classList.add('wrong');

    const clockCard = getElement('clockCard');
    clockCard.classList.remove('wrong-shake');
    void clockCard.offsetWidth;
    clockCard.classList.add('wrong-shake');

    getElement('feedback').className = 'feedback try';
    getElement('feedback').textContent = 'おしい！ もういちど 👀';
    getElement('hintBubble').textContent =
      state.q.minute === 0
        ? 'ヒント：ながい はりが 12なら「◯じ ぴったり」だよ！'
        : 'ヒント：あおい ながい はりが「ぷん」、あかい みじかい はりが「じ」だよ！';
    getElement('hintBubble').classList.remove('hidden');

    playTryAgainSound();
    renderHud();
  }

  function handleAnswer(choice, target, button) {
    if (state.locked) return;

    if (choice === target) {
      handleCorrectAnswer(button);
      return;
    }

    handleWrongAnswer(button);
  }

  function renderHud() {
    const stars = Math.min(3, Math.floor((state.first + 1) / 2));
    getElement('comboText').textContent = String(state.combo);
    getElement('scoreStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    getElement('scoreStars').setAttribute('aria-label', `ほし ${stars}ぐ`);
  }

  function createConfetti(layer, count) {
    for (let index = 0; index < count; index++) {
      const piece = document.createElement('i');
      piece.className = 'confetti';
      piece.style.left = `${Math.random() * 100}%`;
      piece.style.background = CONFETTI_COLORS[index % CONFETTI_COLORS.length];
      piece.style.setProperty('--dur', `${700 + Math.random() * 600}ms`);
      piece.style.setProperty('--drift', `${-80 + Math.random() * 160}px`);
      piece.style.setProperty('--rot', `${Math.random() * 180}deg`);
      layer.appendChild(piece);
      setTimeout(() => piece.remove(), 1450);
    }
  }

  function showComboCelebration() {
    if (state.combo < 2) return;

    const comboLabel = document.createElement('div');
    comboLabel.className = 'combo-float';
    comboLabel.textContent = `${state.combo} コンボ！`;
    document.body.appendChild(comboLabel);
    setTimeout(() => comboLabel.remove(), 800);
  }

  function celebrate() {
    const clockCard = getElement('clockCard');
    const flashLayer = getElement('flashLayer');

    clockCard.classList.remove('correct-pop');
    void clockCard.offsetWidth;
    clockCard.classList.add('correct-pop');

    flashLayer.classList.remove('go');
    void flashLayer.offsetWidth;
    flashLayer.classList.add('go');

    const celebrationLayer = getElement('celebrationLayer');
    const confettiCount = matchMedia('(prefers-reduced-motion: reduce)').matches ? 8 : 30;
    createConfetti(celebrationLayer, confettiCount);
    showComboCelebration();

    if (navigator.vibrate) navigator.vibrate(25);
  }

  let audio = null;

  function playTone(frequency, delay, duration, volume) {
    if (!state.sound) return;

    try {
      audio = audio || new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audio.createOscillator();
      const gain = audio.createGain();

      oscillator.frequency.value = frequency;
      gain.gain.setValueAtTime(0.001, audio.currentTime + delay);
      gain.gain.linearRampToValueAtTime(volume, audio.currentTime + delay + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + delay + duration);
      oscillator.connect(gain).connect(audio.destination);
      oscillator.start(audio.currentTime + delay);
      oscillator.stop(audio.currentTime + delay + duration + 0.03);
    } catch (_) {}
  }

  const playSuccessSound = () => {
    playTone(523, 0, 0.13, 0.13);
    playTone(659, 0.09, 0.14, 0.12);
    playTone(state.combo >= 3 ? 1047 : 784, 0.18, 0.2, 0.11);
  };

  const playTryAgainSound = () => {
    playTone(300, 0, 0.1, 0.06);
    playTone(260, 0.08, 0.11, 0.05);
  };

  function speakCurrentTime() {
    if (!state.sound || !('speechSynthesis' in window)) return;

    try {
      speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(
        state.q.minute ? `${state.q.hour}時${state.q.minute}分` : `${state.q.hour}時`,
      );
      utterance.lang = 'ja-JP';
      utterance.rate = 1.05;
      utterance.pitch = 1.12;
      speechSynthesis.speak(utterance);
    } catch (_) {}
  }

  function awardSticker() {
    const availableStickerIndexes = STICKERS.map((_, index) => index).filter(
      (index) => !progress.stickers.includes(index),
    );
    const stickerIndex = availableStickerIndexes.length
      ? availableStickerIndexes[Math.floor(Math.random() * availableStickerIndexes.length)]
      : Math.floor(Math.random() * STICKERS.length);

    if (!progress.stickers.includes(stickerIndex)) {
      progress.stickers.push(stickerIndex);
    }

    return STICKERS[stickerIndex];
  }

  function renderResult(stars, reward) {
    getElement('resultStars').textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);
    getElement('resultAccuracy').textContent = `${ROUND_SIZE}もんちゅう ${state.first}もん いっぱつせいかい！`;
    getElement('resultTitle').textContent =
      stars === 3 ? 'スーパー とけいヒーロー！' : stars === 2 ? 'やったね！' : 'さいごまで できた！';
    getElement('resultMessage').textContent =
      stars === 3
        ? 'ぜんぶ すごい！ つぎは べつの むずかしさも ためしてみよう。'
        : 'まちがえても だいじょうぶ。くりかえすほど とけいが すらすら よめるよ！';
    getElement('rewardSticker').textContent = reward[0];
    getElement('rewardName').textContent = reward[1];
  }

  function finishGame() {
    progress.plays = (progress.plays || 0) + 1;
    progress.bestCombo = Math.max(progress.bestCombo || 0, state.max);

    const reward = awardSticker();
    saveProgress();
    renderHomeStats();

    const stars = core.starCount(state.first);
    renderResult(stars, reward);
    showScreen('resultScreen');
    setTimeout(celebrate, 80);
  }

  function renderStickerBook() {
    const stickerBook = getElement('stickerBook');
    stickerBook.innerHTML = '';

    STICKERS.forEach(([emoji, name], index) => {
      const unlocked = progress.stickers.includes(index);
      const slot = document.createElement('div');
      slot.className = `sticker-slot${unlocked ? '' : ' locked'}`;
      slot.innerHTML = `<span class="emoji">${unlocked ? emoji : '❔'}</span><span class="name">${
        unlocked ? name : '？？？'
      }</span>`;
      stickerBook.appendChild(slot);
    });
  }

  document.querySelectorAll('[data-level]').forEach((button) => {
    button.onclick = () => startGame(button.dataset.level);
  });
  getElement('againButton').onclick = () => startGame(state.level);
  getElement('changeLevelButton').onclick = getElement('homeButton').onclick = getElement(
    'stickerBackButton',
  ).onclick = () => {
    showScreen('homeScreen');
    renderHomeStats();
  };
  getElement('showStickersButton').onclick = () => {
    renderStickerBook();
    showScreen('stickerScreen');
  };
  getElement('soundButton').onclick = () => {
    state.sound = !state.sound;
    getElement('soundButton').textContent = state.sound ? '🔊' : '🔇';
  };

  createClockTicks();
  renderHomeStats();
})(typeof globalThis !== 'undefined' ? globalThis : this);

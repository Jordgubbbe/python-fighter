const socket = io();

// --- ЗВУКИ (Генерируются прямо в браузере, файлы не нужны) ---
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(type) {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);

  if (type === 'click') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(800, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + 0.1);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.1);
    osc.start(); osc.stop(audioCtx.currentTime + 0.1);
  } else if (type === 'hit') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, audioCtx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(50, audioCtx.currentTime + 0.2);
    gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
    osc.start(); osc.stop(audioCtx.currentTime + 0.2);
  }
}

// Элементы интерфейса
const screens = {
  menu: document.getElementById('menu-screen'),
  wait: document.getElementById('wait-screen'),
  game: document.getElementById('game-screen'),
  end: document.getElementById('end-screen')
};

const btnCreate = document.getElementById('btn-create');
const btnJoin = document.getElementById('btn-join');
const inputCode = document.getElementById('input-code');
const inputNick = document.getElementById('input-nick');
const menuError = document.getElementById('menu-error');
const roomCodeDisplay = document.getElementById('room-code-display');
const myNickDisplay = document.getElementById('my-nick-display');
const questionCode = document.getElementById('question-code');
const optionsBox = document.getElementById('options-box');
const timerDisplay = document.getElementById('timer');
const hp1 = document.getElementById('hp1');
const hp2 = document.getElementById('hp2');
const nick1 = document.getElementById('nick1');
const nick2 = document.getElementById('nick2');
const sprite1 = document.getElementById('sprite1');
const sprite2 = document.getElementById('sprite2');
const gameScreen = document.getElementById('game-screen');

const endTitle = document.getElementById('end-title');
const endDesc = document.getElementById('end-desc');
const btnRestart = document.getElementById('btn-restart');

let myId = null;
let currentRoomId = null;
let myName = "";
let timerInterval = null;

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// --- Кнопки ---
btnCreate.addEventListener('click', () => {
  playSound('click');
  myName = inputNick.value.trim() || "Безымянный";
  socket.emit('createRoom', { name: myName });
});

btnJoin.addEventListener('click', () => {
  playSound('click');
  myName = inputNick.value.trim() || "Безымянный";
  const code = inputCode.value.trim();
  if (code.length === 6) {
    socket.emit('joinRoom', { roomId: code, name: myName });
  } else {
    menuError.textContent = 'Код должен состоять из 6 символов';
  }
});

btnRestart.addEventListener('click', () => {
  playSound('click');
  location.reload();
});

// --- Сокеты ---
socket.on('connect', () => { myId = socket.id; });

socket.on('roomCreated', ({ roomId }) => {
  currentRoomId = roomId;
  roomCodeDisplay.textContent = roomId;
  myNickDisplay.textContent = `Ты: ${myName}`;
  showScreen('wait');
});

socket.on('errorMsg', (msg) => { menuError.textContent = msg; });

socket.on('gameStart', ({ roomId, players }) => {
  currentRoomId = roomId;
  showScreen('game');
  
  const enemyId = Object.keys(players).find(id => id !== myId);
  
  if (players[myId]) nick1.textContent = players[myId] + " (Ты)";
  if (enemyId) nick2.textContent = players[enemyId];
});

socket.on('question', (data) => {
  questionCode.textContent = data.code;
  optionsBox.innerHTML = '';
  
  data.options.forEach((opt, index) => {
    const btn = document.createElement('button');
    btn.textContent = opt;
    btn.onclick = () => submitAnswer(index, btn);
    optionsBox.appendChild(btn);
  });

  let timeLeft = data.time / 1000;
  timerDisplay.textContent = timeLeft;
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    timeLeft--;
    timerDisplay.textContent = timeLeft > 0 ? timeLeft : 0;
    if (timeLeft <= 0) clearInterval(timerInterval);
  }, 1000);
});

function submitAnswer(index, btn) {
  playSound('click');
  const allBtns = optionsBox.querySelectorAll('button');
  allBtns.forEach(b => b.disabled = true);
  btn.classList.add('selected');
  socket.emit('answer', { roomId: currentRoomId, answerIndex: index });
}

socket.on('roundEnd', (data) => {
  clearInterval(timerInterval);
  
  const allBtns = optionsBox.querySelectorAll('button');
  if (allBtns[data.correct]) {
    allBtns[data.correct].style.background = '#00ff00';
    allBtns[data.correct].style.color = '#000';
  }

  const myHp = data.hp[myId];
  const enemyId = Object.keys(data.hp).find(id => id !== myId);
  const enemyHp = data.hp[enemyId];

  // Если я получил урон (HP уменьшилось)
  const oldMyHp = parseInt(hp1.style.width) || 100;
  if (myHp !== undefined && myHp < oldMyHp) {
    playSound('hit');
    gameScreen.classList.add('shake');
    sprite1.classList.add('hurt');
    setTimeout(() => { gameScreen.classList.remove('shake'); sprite1.classList.remove('hurt'); }, 500);
  }

  // Если враг получил урон
  const oldEnemyHp = parseInt(hp2.style.width) || 100;
  if (enemyHp !== undefined && enemyHp < oldEnemyHp) {
    playSound('hit');
    sprite2.classList.add('hurt');
    setTimeout(() => { sprite2.classList.remove('hurt'); }, 500);
  }

  if (myHp !== undefined) hp1.style.width = Math.max(0, myHp) + '%';
  if (enemyHp !== undefined) hp2.style.width = Math.max(0, enemyHp) + '%';
});

socket.on('gameOver', (data) => {
  clearInterval(timerInterval);
  showScreen('end');
  
  if (data.winnerName === "Ничья") {
    endTitle.textContent = "НИЧЬЯ";
    endTitle.className = "draw";
    endDesc.textContent = "Вы оба погибли в неравном бою с кодом.";
  } else if (data.winnerId === myId) {
    endTitle.textContent = "ПОБЕДА!";
    endTitle.className = "win";
    endDesc.textContent = "Ты уничтожил соперника знаниями Python!";
  } else {
    endTitle.textContent = "ПОРАЖЕНИЕ";
    endTitle.className = "lose";
    endDesc.textContent = `Победил ${data.winnerName}. В следующий раз повезет!`;
  }
});

socket.on('opponentLeft', () => {
  alert("Соперник вышел из игры");
  location.reload();
});

socket.on('disconnect', () => { showScreen('menu'); });
import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, '../client')));
app.get('/health', (req, res) => res.status(200).json({ status: 'ok' }));

const questions = JSON.parse(readFileSync(path.join(__dirname, 'questions.json'), 'utf-8'));
const rooms = new Map();

const HP_START = 100;
const DAMAGE = 20;
const QUESTION_TIME = 10000;

function genRoomId() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function pickQuestion(used) {
  const available = questions.filter(q => !used.has(q.id));
  const pool = available.length ? available : questions;
  return pool[Math.floor(Math.random() * pool.length)];
}

io.on('connection', (socket) => {
  socket.on('createRoom', (data) => {
    const roomId = genRoomId();
    rooms.set(roomId, {
      players: [socket.id],
      names: { [socket.id]: data.name || 'Игрок 1' },
      hp: { [socket.id]: HP_START },
      usedQuestions: new Set(),
      currentQ: null,
      answers: {},
      timer: null
    });
    socket.join(roomId);
    socket.emit('roomCreated', { roomId });
  });

  socket.on('joinRoom', (data) => {
    const id = data.roomId.toUpperCase();
    const room = rooms.get(id);

    if (!room) return socket.emit('errorMsg', 'Комната не найдена');
    if (room.players.length >= 2) return socket.emit('errorMsg', 'Комната заполнена');

    room.players.push(socket.id);
    room.names[socket.id] = data.name || 'Игрок 2';
    room.hp[socket.id] = HP_START;
    socket.join(id);
    
    io.to(id).emit('gameStart', { 
      roomId: id,
      players: room.names 
    });
    startRound(id);
  });

  socket.on('answer', ({ roomId, answerIndex }) => {
    const room = rooms.get(roomId);
    if (!room || !room.currentQ) return;
    if (room.answers[socket.id] !== undefined) return;

    room.answers[socket.id] = {
      answerIndex,
      correct: answerIndex === room.currentQ.correct
    };

    if (Object.keys(room.answers).length === room.players.length) {
      endRound(roomId);
    }
  });

  socket.on('disconnect', () => {
    for (const [roomId, room] of rooms) {
      if (room.players.includes(socket.id)) {
        io.to(roomId).emit('opponentLeft');
        rooms.delete(roomId);
      }
    }
  });
});

function startRound(roomId) {
  const room = rooms.get(roomId);
  if (!room) return;

  const q = pickQuestion(room.usedQuestions);
  room.usedQuestions.add(q.id);
  room.currentQ = q;
  room.answers = {};

  io.to(roomId).emit('question', {
    id: q.id,
    code: q.code,
    options: q.options,
    time: QUESTION_TIME
  });

  room.timer = setTimeout(() => endRound(roomId), QUESTION_TIME);
}

function endRound(roomId) {
  const room = rooms.get(roomId);
  if (!room || !room.currentQ) return;

  clearTimeout(room.timer);
  const q = room.currentQ;
  const results = {};

  for (const pid of room.players) {
    const ans = room.answers[pid];
    if (!ans) {
      room.hp[pid] -= DAMAGE;
      results[pid] = { correct: false, timedOut: true };
    } else if (!ans.correct) {
      room.hp[pid] -= DAMAGE;
      results[pid] = { correct: false, timedOut: false };
    } else {
      results[pid] = { correct: true, timedOut: false };
    }
  }

  const correctPlayers = room.players.filter(p => results[p].correct);
  if (correctPlayers.length === 1) {
    const winner = correctPlayers[0];
    const loser = room.players.find(p => p !== winner);
    const dmg = q.trap ? DAMAGE * 2 : DAMAGE;
    room.hp[loser] -= dmg;
  }

  for (const pid of room.players) {
    if (room.hp[pid] < 0) room.hp[pid] = 0;
  }

  io.to(roomId).emit('roundEnd', {
    correct: q.correct,
    results,
    hp: room.hp
  });

  const dead = room.players.filter(p => room.hp[p] <= 0);
  if (dead.length > 0) {
    const winnerId = room.players.find(p => room.hp[p] > 0) || null;
    const winnerName = winnerId ? room.names[winnerId] : "Ничья";
    
    io.to(roomId).emit('gameOver', { 
      winnerId, 
      winnerName,
      hp: room.hp 
    });
    rooms.delete(roomId);
    return;
  }

  setTimeout(() => startRound(roomId), 2000);
}

const PORT = process.env.PORT || 3001;
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на http://localhost:${PORT}`);
});
const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require("socket.io");
const io = new Server(server);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Game State
let players = {}; // { socketId: { nickname, status: 'idle'|'playing', ... } }
let games = {};   // { gameId: { player1, player2, score... } }

io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    socket.on('login', (data) => {
        players[socket.id] = {
            id: socket.id,
            nickname: data.nickname,
            difficulty: data.difficulty || 'medium',
            sets: data.sets || 3,
            status: 'idle'
        };
        io.emit('player_list', Object.values(players));
    });

    socket.on('update_settings', (data) => {
        if (players[socket.id]) {
            players[socket.id].difficulty = data.difficulty;
            players[socket.id].sets = data.sets;
            io.emit('player_list', Object.values(players));
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        if (players[socket.id]) {
            // If in game, notify opponent
            if (players[socket.id].status === 'playing' && players[socket.id].gameId) {
                const gameId = players[socket.id].gameId;
                const game = games[gameId];
                if (game) {
                    const opponentId = game.p1 === socket.id ? game.p2 : game.p1;
                    const disconnectedName = players[socket.id].nickname;
                    const gameFinished = game.finished || false;

                    io.to(opponentId).emit('opponent_disconnected', {
                        nickname: disconnectedName,
                        gameFinished: gameFinished
                    });

                    if (players[opponentId]) players[opponentId].status = 'idle';
                    delete games[gameId];
                }
            }
            delete players[socket.id];
            io.emit('player_list', Object.values(players));
        }
    });

    // Matchmaking
    socket.on('challenge', (targetId) => {
        if (players[targetId] && players[targetId].status === 'idle') {
            io.to(targetId).emit('challenge_received', {
                from: socket.id,
                nickname: players[socket.id].nickname,
                difficulty: players[socket.id].difficulty,
                sets: players[socket.id].sets
            });
        }
    });

    socket.on('challenge_response', (data) => {
        // data: { accepted: boolean, from: challengerId }
        const challengerId = data.from;
        const responderId = socket.id;

        if (data.accepted) {
            // Create Game
            const gameId = `game_${Date.now()}_${Math.random()}`;
            games[gameId] = {
                id: gameId,
                p1: challengerId,
                p2: responderId,
                score: { p1: 0, p2: 0 },
                paused: false
            };

            players[challengerId].status = 'playing';
            players[challengerId].gameId = gameId;
            players[responderId].status = 'playing';
            players[responderId].gameId = gameId;

            // Notify both to start
            io.to(challengerId).emit('game_start', {
                opponent: players[responderId].nickname,
                role: 'host',
                gameId,
                settings: { difficulty: players[challengerId].difficulty, sets: players[challengerId].sets }
            });
            io.to(responderId).emit('game_start', {
                opponent: players[challengerId].nickname,
                role: 'client',
                gameId,
                settings: { difficulty: players[challengerId].difficulty, sets: players[challengerId].sets }
            });

            io.emit('player_list', Object.values(players)); // Update statuses
        } else {
            io.to(challengerId).emit('challenge_declined', { nickname: players[responderId].nickname });
        }
    });

    // Game Logic Relay
    socket.on('game_update', (data) => {
        // data: { gameId, type: 'paddle'|'ball'|'score', payload }
        const game = games[data.gameId];
        if (!game) return;

        const targetId = game.p1 === socket.id ? game.p2 : game.p1;
        io.to(targetId).emit('game_update', data);
    });

    socket.on('pause_request', (data) => {
        const game = games[data.gameId];
        if (!game) return;
        const targetId = game.p1 === socket.id ? game.p2 : game.p1;
        io.to(targetId).emit('pause_request', { from: players[socket.id].nickname });
    });

    socket.on('pause_response', (data) => {
        const game = games[data.gameId];
        if (!game) return;
        const targetId = game.p1 === socket.id ? game.p2 : game.p1;
        io.to(targetId).emit('pause_response', data); // accepted: true/false
    });

    socket.on('chat_message', (data) => {
        const game = games[data.gameId];
        if (!game) return;
        const targetId = game.p1 === socket.id ? game.p2 : game.p1;
        io.to(targetId).emit('chat_message', { from: players[socket.id].nickname, message: data.message });
    });

    socket.on('game_over', (data) => {
        const game = games[data.gameId];
        if (!game) return;

        // Mark game as finished
        game.finished = true;

        // Notify other player about game over
        const targetId = game.p1 === socket.id ? game.p2 : game.p1;
        io.to(targetId).emit('game_over', { winner: data.winner });

        console.log('Game Over:', data.gameId, 'Winner:', data.winner);
    });

    socket.on('rematch_request', (data) => {
        const game = games[data.gameId];
        if (!game) return;

        const targetId = game.p1 === socket.id ? game.p2 : game.p1;
        const requesterName = players[socket.id].nickname;

        io.to(targetId).emit('rematch_request', {
            from: socket.id,
            nickname: requesterName
        });
    });

    socket.on('rematch_response', (data) => {
        const game = games[data.gameId];
        if (!game) return;

        const targetId = data.from;

        if (data.accepted) {
            // Reset game state
            game.finished = false;
            game.score = { p1: 0, p2: 0 };

            // Notify both players to restart
            io.to(game.p1).emit('rematch_accepted');
            io.to(game.p2).emit('rematch_accepted');
        } else {
            io.to(targetId).emit('rematch_declined', {
                nickname: players[socket.id].nickname
            });
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

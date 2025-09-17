var Mode = require('./Mode');

function FFA() {
    Mode.apply(this, Array.prototype.slice.call(arguments));

    this.ID = 0;
    this.name = "Free For All";
    this.specByLeaderboard = true;
    
    // Round-based system
    this.roundDuration = 1200; // 1 minute for testing (60 seconds * 20 ticks per second)
    this.roundTimer = this.roundDuration;
    this.roundActive = false;
    this.roundNumber = 1;
    this.lastWinner = null;
    this.lastWinnerAddress = "";
    this.lastWinnerSent = ""; // Track what winner we already sent
    this.countdownTimer = 100; // 5 seconds countdown (20 ticks per second)
    this.countdownStarted = false;
    this.intermissionTimer = 200; // 10 seconds between rounds
    this.gamePhase = 0; // 0=countdown, 1=active, 2=ended
}

module.exports = FFA;
FFA.prototype = new Mode();

// Gamemode Specific Functions

FFA.prototype.leaderboardAddSort = function(player,leaderboard) {
    // Adds the player and sorts the leaderboard
    var len = leaderboard.length - 1;
    var loop = true;
    while ((len >= 0) && (loop)) {
        // Start from the bottom of the leaderboard
        if (player.getScore(false) <= leaderboard[len].getScore(false)) {
            leaderboard.splice(len + 1, 0, player);
            loop = false; // End the loop if a spot is found
        }
        len--;
    }
    if (loop) {
        // Add to top of the list because no spots were found
        leaderboard.splice(0, 0,player);
    }
};

FFA.prototype.startNewRound = function(gameServer) {
    console.log("\u001B[33m[Round " + this.roundNumber + "] Starting countdown...\u001B[0m");
    
    // Clear lastWinnerSent for new round
    this.lastWinnerSent = "";
    
    // Clear the map properly
    var len = gameServer.nodes.length;
    for (var i = len - 1; i >= 0; i--) {
        var node = gameServer.nodes[i];
        if (node) {
            gameServer.removeNode(node);
        }
    }
    
    // Clear arrays
    gameServer.nodes = [];
    gameServer.nodesPlayer = [];
    gameServer.nodesVirus = [];
    gameServer.nodesEjected = [];
    gameServer.currentFood = 0;
    
    // Reset all players (including bots)
    for (var i = 0; i < gameServer.clients.length; i++) {
        var client = gameServer.clients[i].playerTracker;
        
        // Remove all cells
        client.cells = [];
        
        // Ensure bot has a color
        if (!client.color) {
            client.color = gameServer.getRandomColor();
        }
        
        client.score = 0;
        client.hscore = 0;
        client.cscore = 0;
    }
    
    // Reset game state properly
    this.roundTimer = this.roundDuration;
    this.countdownTimer = 100;
    this.gamePhase = 0; // Countdown phase
    
    // Spawn initial food after delay
    setTimeout(function() {
        gameServer.startingFood();
    }, 100);
    
    // Announce winner fee message
    var Packet = require('../packet');
    var packet = new Packet.BroadCast("Each round winner receives creator's fee! Use your SOL address as name!");
    for (var i = 0; i < gameServer.clients.length; i++) {
        if (gameServer.clients[i] && gameServer.clients[i].sendPacket) {
            gameServer.clients[i].sendPacket(packet);
        }
    }
};

FFA.prototype.endRound = function(gameServer) {
    // Find winner (top player)
    var winner = null;
    var topScore = 0;
    
    for (var i = 0; i < gameServer.clients.length; i++) {
        var client = gameServer.clients[i].playerTracker;
        if (client.getScore(true) > topScore) {
            topScore = client.getScore(true);
            winner = client;
        }
    }
    
    if (winner) {
        this.lastWinner = winner.getName() || "Unnamed";
        this.lastWinnerAddress = winner.getName() || "";
        console.log("\u001B[32m[Round " + this.roundNumber + "] Winner: " + this.lastWinner + " with score " + topScore + "\u001B[0m");
        
        // Broadcast winner
        var Packet = require('../packet');
        var packet = new Packet.BroadCast("Round " + this.roundNumber + " Winner: " + this.lastWinner + "! Creator's fee sent!");
        for (var i = 0; i < gameServer.clients.length; i++) {
            gameServer.clients[i].sendPacket(packet);
        }
    }
    
    this.gamePhase = 2; // Ended phase
    this.intermissionTimer = 200; // 10 seconds
    this.roundNumber++;
};

// Override

FFA.prototype.onServerInit = function(gameServer) {
    // Initialize packet handler if needed
    var Packet = require('../packet');
    
    // Start first round
    this.startNewRound(gameServer);
}

FFA.prototype.onPlayerSpawn = function(gameServer,player) {
    // Random color - set this first before any checks
    player.color = gameServer.getRandomColor();
    
    // Only spawn if round is active
    if (this.gamePhase !== 1) {
        return; // Don't spawn during countdown or intermission
    }
    
    // Set up variables
    var pos, startMass;
    
    // Check if there are ejected mass in the world.
    if (gameServer.nodesEjected.length > 0) {
        var index = Math.floor(Math.random() * 100) + 1;
        if (index <= gameServer.config.ejectSpawnPlayer) {
            // Get ejected cell
            var index = Math.floor(Math.random() * gameServer.nodesEjected.length);
            var e = gameServer.nodesEjected[index];

            // Remove ejected mass
            gameServer.removeNode(e);

            // Inherit
            pos = {x: e.position.x, y: e.position.y};
            startMass = e.mass;

            var color = e.getColor();
            player.setColor({
                'r': color.r,
                'g': color.g,
                'b': color.b
            });
        }
    }
    
    // Spawn player
    gameServer.spawnPlayer(player,pos,startMass);
}

FFA.prototype.onTick = function(gameServer) {
    // Send time update every second (20 ticks)
    if (gameServer.tickMain % 20 === 0) {
        this.sendRoundUpdate(gameServer);
    }
    
    switch(this.gamePhase) {
        case 0: // Countdown phase
            this.countdownTimer--;
            
            if (this.countdownTimer <= 0) {
                this.gamePhase = 1; // Start round
                console.log("\u001B[32m[Round " + this.roundNumber + "] Started!\u001B[0m");
                
                var Packet = require('../packet');
                var packet = new Packet.BroadCast("Round " + this.roundNumber + " has started! Good luck!");
                for (var i = 0; i < gameServer.clients.length; i++) {
                    gameServer.clients[i].sendPacket(packet);
                }
                
                // Spawn all waiting players
                for (var i = 0; i < gameServer.clients.length; i++) {
                    var client = gameServer.clients[i].playerTracker;
                    if (client.cells.length <= 0 && !client.spectate) {
                        this.onPlayerSpawn(gameServer, client);
                    }
                }
            }
            break;
            
        case 1: // Active round
            this.roundTimer--;
            
            // Announce time warnings for 1 minute round
            if (this.roundTimer === 200) { // 10 seconds left
                var Packet = require('../packet');
                var packet = new Packet.BroadCast("10 seconds remaining! Final push!");
                for (var i = 0; i < gameServer.clients.length; i++) {
                    gameServer.clients[i].sendPacket(packet);
                }
            }
            
            if (this.roundTimer <= 0) {
                this.endRound(gameServer);
            }
            break;
            
        case 2: // Intermission
            this.intermissionTimer--;
            if (this.intermissionTimer <= 0) {
                this.startNewRound(gameServer);
            }
            break;
    }
}

FFA.prototype.sendRoundUpdate = function(gameServer) {
    // Calculate time left in seconds
    var timeLeft = 0;
    if (this.gamePhase === 0) {
        timeLeft = Math.ceil(this.countdownTimer / 20);
    } else if (this.gamePhase === 1) {
        timeLeft = Math.ceil(this.roundTimer / 20);
    } else if (this.gamePhase === 2) {
        timeLeft = Math.ceil(this.intermissionTimer / 20);
    }
    
    // Prevent negative values
    if (timeLeft < 0) timeLeft = 0;
    
    // Only send winner name when phase changes to 2 (round ended)
    var winnerToSend = "";
    if (this.gamePhase === 2 && this.lastWinnerSent !== this.lastWinner) {
        winnerToSend = this.lastWinner || "";
        this.lastWinnerSent = this.lastWinner;
    }
    
    // Send custom packet with round info (using BroadCast as workaround)
    var Packet = require('../packet');
    var timeMsg = "TIME:" + this.gamePhase + ":" + timeLeft + ":" + this.roundNumber + ":" + winnerToSend;
    var packet = new Packet.BroadCast(timeMsg);
    
    for (var i = 0; i < gameServer.clients.length; i++) {
        if (gameServer.clients[i] && gameServer.clients[i].sendPacket) {
            try {
                gameServer.clients[i].sendPacket(packet);
            } catch(e) {
                // Client disconnected
            }
        }
    }
}

FFA.prototype.updateLB = function(gameServer) {
    var lb = [];
    
    // Loop through all clients for normal leaderboard
    for (var i = 0; i < gameServer.clients.length; i++) {
        if (typeof gameServer.clients[i] == "undefined") {
            continue;
        }

        var player = gameServer.clients[i].playerTracker;
        var playerScore = player.getScore(true);
        if (player.cells.length <= 0) {
            continue;
        }

        if (lb.length == 0) {
            // Initial player
            lb.push(player);
            continue;
        } else if (lb.length < gameServer.config.gameLBlength) {
            this.leaderboardAddSort(player,lb);
        } else {
            // 10 in leaderboard already
            if (playerScore > lb[gameServer.config.gameLBlength - 1].getScore(false)) {
                lb.pop();
                this.leaderboardAddSort(player,lb);
            }
        }
    }
    
    // Strip long names in leaderboard
    for (var i = 0; i < lb.length; i++) {
        var player = lb[i];
        var originalName = player.getName();
        if (originalName && originalName.length > 10) {
            // Store original name
            player._fullName = originalName;
            // Create shortened version for display
            player._displayName = originalName.substr(0, 4) + '...' + originalName.substr(-4);
        } else {
            player._fullName = originalName;
            player._displayName = originalName;
        }
    }

    this.rankOne = lb[0];
    gameServer.leaderboard = lb;
};

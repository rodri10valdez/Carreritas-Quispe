const SUPABASE_URL = "https://snywfwnbvxokjiviovsr.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNueXdmd25idnhva2ppdmlvdnNyIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTE1OTA0MTUsImV4cCI6MjEwNzE2NjQxNX0.YqRB_wuOlvhC94b7RPt5lsGxWiAA9zQ3RgtGB_kZO50";

let supabaseClient = null;
try {
    if (window.supabase) {
        supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    }
} catch (e) {
    console.error("Error al iniciar Supabase:", e);
}

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const hudScoreElement = document.getElementById("hudScore");
const hudLevelElement = document.getElementById("hudLevel");
const inGameHud = document.getElementById("inGameHud");
const toggleHudBtn = document.getElementById("toggleHudBtn");
const toggleAudioBtn = document.getElementById("toggleAudioBtn");

const overlay = document.getElementById("gameOverlay");
const nameCard = document.getElementById("nameCard");
const startCard = document.getElementById("startCard");
const usernameInput = document.getElementById("usernameInput");
const saveNameButton = document.getElementById("saveNameButton");
const leaderboardList = document.getElementById("leaderboardList");

const overlayIcon = document.getElementById("overlayIcon");
const overlayTitle = document.getElementById("overlayTitle");
const overlayMessage = document.getElementById("overlayMessage");
const startButton = document.getElementById("startButton");

let username = localStorage.getItem("streetRushUser") || "";
let isHudVisible = true;

// SISTEMA DE MÚSICA 8-BITS
let audioCtx = null;
let isAudioMuted = false;
let musicInterval = null;
let noteIndex = 0;

const melody = [
    261.63, 329.63, 392.00, 523.25, 392.00, 329.63,
    293.66, 349.23, 440.00, 587.33, 440.00, 349.23,
    261.63, 329.63, 392.00, 523.25, 659.25, 523.25,
    392.00, 329.63, 293.66, 349.23, 392.00, 261.63
];

function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === "suspended") {
        audioCtx.resume();
    }
}

function playNextNote() {
    if (!audioCtx || isAudioMuted || gameState !== "playing") return;

    try {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = "square";
        osc.frequency.setValueAtTime(melody[noteIndex], audioCtx.currentTime);

        gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.14);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);

        noteIndex = (noteIndex + 1) % melody.length;
    } catch (e) {}
}

function startMusic() {
    initAudio();
    stopMusic();
    noteIndex = 0;
    musicInterval = setInterval(playNextNote, 160);
}

function stopMusic() {
    if (musicInterval) {
        clearInterval(musicInterval);
        musicInterval = null;
    }
}

toggleAudioBtn.addEventListener("click", () => {
    isAudioMuted = !isAudioMuted;
    toggleAudioBtn.textContent = isAudioMuted ? "🔇" : "🔊";
    if (isAudioMuted) {
        stopMusic();
    } else if (gameState === "playing") {
        startMusic();
    }
});

toggleHudBtn.addEventListener("click", () => {
    isHudVisible = !isHudVisible;
    if (isHudVisible) {
        inGameHud.classList.remove("hidden");
    } else {
        inGameHud.classList.add("hidden");
    }
});

if (username) {
    nameCard.classList.add("hidden");
    startCard.classList.remove("hidden");
    overlayTitle.textContent = `¡Hola, ${username}!`;
    overlayMessage.textContent = "Presiona para jugar";
    startButton.textContent = "EMPEZAR";
} else {
    nameCard.classList.remove("hidden");
    startCard.classList.add("hidden");
}

function handleSaveName() {
    const val = usernameInput.value.trim();
    if (!val) {
        alert("Ingresa un apodo");
        return;
    }
    username = val;
    localStorage.setItem("streetRushUser", username);
    startGame();
}

saveNameButton.addEventListener("click", handleSaveName);
usernameInput.addEventListener("keydown", e => {
    if (e.key === "Enter") handleSaveName();
});

// ROAD & CARRILES (4 carriles)
const road = { x: 50, width: 380, lanes: 4, laneWidth: 95 };
const laneCenters = [
    road.x + road.laneWidth * 0.5 - 22,
    road.x + road.laneWidth * 1.5 - 22,
    road.x + road.laneWidth * 2.5 - 22,
    road.x + road.laneWidth * 3.5 - 22
];

let currentLane = 1;
const player = { 
    x: laneCenters[currentLane], 
    y: 500, 
    width: 46, 
    height: 85, 
    speed: 5, 
    color: "#e63946"
};

const enemyColors = ["#3a86ff", "#ff006e", "#8338ec", "#fb5607", "#00f5d4"];
const keys = {};

let enemies = [];
let score = 0;
let carsPassed = 0;
let gameLevel = 1;
let gameSpeed = 3;
let spawnTimer = 0;
let roadLineOffset = 0;
let gameState = "ready";
let lastFrameTime = 0;
let animationId = null;

// SISTEMA DE BIOMAS CON TRANSICIÓN SUTIL CADA 20 SEGUNDOS
let currentBiomeIndex = 0;
let nextBiomeIndex = 1;
let biomeTimer = 0;
let transitionProgress = 0; // 0 a 1 para interpolar colores
const BIOME_DURATION = 20;

const biomes = [
    { name: "forest", grassColor: [29, 58, 39], roadColor: [34, 42, 48], prop: "tree" },
    { name: "desert", grassColor: [227, 188, 136], roadColor: [58, 50, 40], prop: "cactus" },
    { name: "meadow", grassColor: [56, 112, 58], roadColor: [38, 47, 54], prop: "grass_patch" },
    { name: "bushes", grassColor: [35, 82, 53], roadColor: [36, 44, 51], prop: "bush" },
    { name: "water", grassColor: [29, 78, 137], roadColor: [26, 35, 46], prop: "wave" }
];

let sideProps = [];
let roadPotholes = []; // Baches puramente estéticos

function initProps() {
    sideProps = [];
    for (let y = -100; y < canvas.height + 100; y += 80) {
        sideProps.push({ x: 15, y, side: "left" });
        sideProps.push({ x: 445, y: y + 40, side: "right" });
    }

    roadPotholes = [];
    for (let y = -50; y < canvas.height + 50; y += 160) {
        roadPotholes.push({ 
            x: road.x + 30 + Math.random() * (road.width - 60), 
            y: y + Math.random() * 50, 
            width: 14 + Math.random() * 12, 
            height: 8 + Math.random() * 6 
        });
    }
}
initProps();

function interpolateColor(c1, c2, factor) {
    const r = Math.round(c1[0] + (c2[0] - c1[0]) * factor);
    const g = Math.round(c1[1] + (c2[1] - c1[1]) * factor);
    const b = Math.round(c1[2] + (c2[2] - c1[2]) * factor);
    return `rgb(${r},${g},${b})`;
}

function formatScore(val) {
    return String(Math.floor(val)).padStart(5, "0");
}

function formatLevel(val) {
    return String(val).padStart(2, "0");
}

async function updateLeaderboardUI() {
    if (!supabaseClient) {
        leaderboardList.innerHTML = "<li><span>Sin conexión</span></li>";
        return;
    }

    try {
        const { data, error } = await supabaseClient
            .from("carreritas")
            .select("name, score")
            .order("score", { ascending: false })
            .limit(10);

        if (error) {
            leaderboardList.innerHTML = "<li><span>Error de tabla</span></li>";
            return;
        }

        leaderboardList.innerHTML = "";
        if (!data || data.length === 0) {
            leaderboardList.innerHTML = "<li><span>Sin registros</span></li>";
            return;
        }

        data.forEach((entry, idx) => {
            const li = document.createElement("li");
            li.innerHTML = `<span>${idx + 1}. ${entry.name}</span> <strong>${formatScore(entry.score)}</strong>`;
            leaderboardList.appendChild(li);
        });
    } catch (e) {
        leaderboardList.innerHTML = "<li><span>Sin conexión</span></li>";
    }
}

async function registerScoreInLeaderboard(finalScore) {
    if (!username || finalScore <= 0 || !supabaseClient) return;

    try {
        const { data: existing } = await supabaseClient
            .from("carreritas")
            .select("id, score")
            .eq("name", username)
            .maybeSingle();

        if (existing) {
            if (finalScore > existing.score) {
                await supabaseClient
                    .from("carreritas")
                    .update({ score: finalScore, updated_at: new Date() })
                    .eq("id", existing.id);
            }
        } else {
            await supabaseClient
                .from("carreritas")
                .insert([{ name: username, score: finalScore }]);
        }

        updateLeaderboardUI();
    } catch (e) {}
}

setTimeout(updateLeaderboardUI, 300);

function drawProp(propType, x, y) {
    if (propType === "tree") {
        ctx.fillStyle = "#12261a";
        ctx.beginPath();
        ctx.arc(x + 10, y + 10, 16, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#2d5a3f";
        ctx.beginPath();
        ctx.arc(x + 10, y + 8, 12, 0, Math.PI * 2);
        ctx.fill();
    } else if (propType === "cactus") {
        ctx.fillStyle = "#3b7a57";
        ctx.fillRect(x + 8, y, 6, 22);
        ctx.fillRect(x + 3, y + 6, 12, 4);
        ctx.fillRect(x + 3, y + 2, 4, 6);
        ctx.fillRect(x + 11, y + 4, 4, 6);
    } else if (propType === "grass_patch") {
        ctx.fillStyle = "#529455";
        ctx.fillRect(x + 4, y + 8, 3, 10);
        ctx.fillRect(x + 9, y + 4, 3, 14);
        ctx.fillRect(x + 14, y + 9, 3, 9);
    } else if (propType === "bush") {
        ctx.fillStyle = "#1e472a";
        ctx.beginPath();
        ctx.arc(x + 8, y + 10, 10, 0, Math.PI * 2);
        ctx.arc(x + 16, y + 10, 8, 0, Math.PI * 2);
        ctx.fill();
    } else if (propType === "wave") {
        ctx.fillStyle = "#48cae4";
        ctx.fillRect(x, y + 6, 18, 3);
        ctx.fillRect(x + 6, y + 14, 14, 3);
    }
}

function drawRoad(deltaFactor = 1) {
    const currentBiome = biomes[currentBiomeIndex];
    const nextBiome = biomes[nextBiomeIndex];

    const grassCol = interpolateColor(currentBiome.grassColor, nextBiome.grassColor, transitionProgress);
    const roadCol = interpolateColor(currentBiome.roadColor, nextBiome.roadColor, transitionProgress);

    // Fondo césped/entorno
    ctx.fillStyle = grassCol;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Accesorios laterales
    for (const prop of sideProps) {
        if (gameState === "playing") {
            prop.y += gameSpeed * deltaFactor;
            if (prop.y > canvas.height + 40) prop.y = -60;
        }
        drawProp(transitionProgress < 0.5 ? currentBiome.prop : nextBiome.prop, prop.x, prop.y);
    }

    // Pista principal
    ctx.fillStyle = roadCol;
    ctx.fillRect(road.x, 0, road.width, canvas.height);

    // Baches y grietas estéticas (Sin afectar en absoluto la jugabilidad)
    ctx.fillStyle = "rgba(0, 0, 0, 0.25)";
    for (const pothole of roadPotholes) {
        if (gameState === "playing") {
            pothole.y += gameSpeed * deltaFactor;
            if (pothole.y > canvas.height + 20) {
                pothole.y = -30;
                pothole.x = road.x + 30 + Math.random() * (road.width - 60);
            }
        }
        ctx.beginPath();
        ctx.ellipse(pothole.x, pothole.y, pothole.width / 2, pothole.height / 2, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // Bordes de la pista
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(road.x, 0, 5, canvas.height);
    ctx.fillRect(road.x + road.width - 5, 0, 5, canvas.height);

    ctx.fillStyle = "#ffcc65";
    ctx.fillRect(road.x + 8, 0, 2, canvas.height);
    ctx.fillRect(road.x + road.width - 10, 0, 2, canvas.height);

    // Líneas divisoras
    ctx.fillStyle = "#d6dce3";
    for (let lane = 1; lane <= 3; lane++) {
        const lineX = road.x + lane * road.laneWidth - 2;
        for (let y = -50 + roadLineOffset; y < canvas.height; y += 90) {
            ctx.fillRect(lineX, y, 4, 43);
        }
    }

    if (gameState === "playing") {
        roadLineOffset = (roadLineOffset + gameSpeed * deltaFactor) % 90;
        
        biomeTimer += deltaFactor / 60;
        if (biomeTimer >= BIOME_DURATION - 4) {
            // Últimos 4 segundos: transición gradual suave
            transitionProgress = Math.min(1, transitionProgress + (deltaFactor / 60) / 4);
        }

        if (biomeTimer >= BIOME_DURATION) {
            biomeTimer = 0;
            transitionProgress = 0;
            currentBiomeIndex = nextBiomeIndex;
            nextBiomeIndex = (nextBiomeIndex + 1) % biomes.length;
        }
    }
}

// DIBUJAR AUTO TIPO MUSTANG (MUSCLE CAR CLásico Deportivo)
function drawMustangCar(car) {
    const { x, y, width: w, height: h, color } = car;

    // Sombra
    ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
    ctx.fillRect(x + 2, y + 6, w, h);

    // Neumáticos anchos
    ctx.fillStyle = "#111";
    ctx.fillRect(x - 4, y + 12, 8, 20);
    ctx.fillRect(x + w - 4, y + 12, 8, 20);
    ctx.fillRect(x - 5, y + h - 26, 10, 22);
    ctx.fillRect(x + w - 5, y + h - 26, 10, 22);

    // Chasis principal tipo Muscle Car
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x + 6, y + 8);
    ctx.lineTo(x + w - 6, y + 8);
    ctx.quadraticCurveTo(x + w, y + 15, x + w - 2, y + 30);
    ctx.lineTo(x + w - 1, y + h - 10);
    ctx.quadraticCurveTo(x + w / 2, y + h + 2, x + 1, y + h - 10);
    ctx.lineTo(x + 2, y + 30);
    ctx.quadraticCurveTo(x, y + 15, x + 6, y + 8);
    ctx.closePath();
    ctx.fill();

    // Capó con entradas de aire agresivas estilo Mustang
    ctx.fillStyle = "#111318";
    ctx.fillRect(x + 12, y + 10, w - 24, 18);
    ctx.fillStyle = color;
    ctx.fillRect(x + 16, y + 14, 6, 10);
    ctx.fillRect(x + w - 22, y + 14, 6, 10);

    // Cabina (Techo Fastback y Parabrisas)
    ctx.fillStyle = "#1a2230";
    ctx.beginPath();
    ctx.moveTo(x + 8, y + 34);
    ctx.lineTo(x + w - 8, y + 34);
    ctx.lineTo(x + w - 10, y + h - 22);
    ctx.lineTo(x + 10, y + h - 22);
    ctx.closePath();
    ctx.fill();

    // Luces delanteras amarillas/blancas intensas
    ctx.fillStyle = "#ffffaa";
    ctx.fillRect(x + 3, y + 6, 8, 4);
    ctx.fillRect(x + w - 11, y + 6, 8, 4);

    // Luces traseras icónicas alargadas (Rojas)
    ctx.fillStyle = "#ff1e38";
    ctx.fillRect(x + 3, y + h - 6, 11, 4);
    ctx.fillRect(x + w - 14, y + h - 6, 11, 4);
}

function drawEnemyCar(car) {
    const { x, y, width: w, height: h, color, type } = car;

    ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
    ctx.fillRect(x + 4, y + 5, w, h);

    if (type === "truck") {
        ctx.fillStyle = "#222";
        ctx.fillRect(x + 2, y + 10, w - 4, h - 15);

        ctx.fillStyle = color;
        ctx.fillRect(x + 4, y + 12, w - 8, h - 35);
        ctx.fillRect(x + 2, y + h - 20, w - 4, 18);

        ctx.fillStyle = "#111";
        ctx.fillRect(x + 5, y + h - 16, w - 10, 6);

        ctx.fillStyle = "#ff0000";
        ctx.fillRect(x + 4, y + 14, 8, 3);
        ctx.fillRect(x + w - 12, y + 14, 8, 3);
    } else {
        ctx.fillStyle = "#111";
        ctx.fillRect(x - 3, y + 10, 5, 16);
        ctx.fillRect(x + w - 2, y + 10, 5, 16);
        ctx.fillRect(x - 3, y + h - 24, 5, 16);
        ctx.fillRect(x + w - 2, y + h - 24, 5, 16);

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect ? ctx.roundRect(x, y, w, h, 8) : ctx.fillRect(x, y, w, h);
        ctx.fill();

        ctx.fillStyle = "#1b263b";
        ctx.fillRect(x + 6, y + 15, w - 12, 14);
        ctx.fillRect(x + 6, y + h - 25, w - 12, 10);

        ctx.fillStyle = "#ffffaa";
        ctx.fillRect(x + 4, y + 3, 8, 4);
        ctx.fillRect(x + w - 12, y + 3, 8, 4);

        ctx.fillStyle = "#ff3333";
        ctx.fillRect(x + 4, y + h - 5, 8, 3);
        ctx.fillRect(x + w - 12, y + h - 5, 8, 3);
    }
}

function drawScene(deltaFactor = 1) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoad(deltaFactor);
    for (const enemy of enemies) drawEnemyCar(enemy);
    drawMustangCar(player);
}

function spawnEnemy() {
    const laneIndex = Math.floor(Math.random() * 4);
    const carWidth = 46;
    const x = road.x + laneIndex * road.laneWidth + (road.laneWidth - carWidth) / 2;

    const tooClose = enemies.some(e => Math.abs(e.x - x) < 20 && e.y < 180);
    if (tooClose) return;

    const isTruck = Math.random() < 0.35;
    const type = isTruck ? "truck" : "car";
    const height = isTruck ? 115 : 80;
    const width = isTruck ? 50 : carWidth;

    enemies.push({
        x: x - (width - carWidth) / 2,
        y: -140,
        width,
        height,
        color: enemyColors[Math.floor(Math.random() * enemyColors.length)],
        speed: gameSpeed * 0.9,
        type,
        counted: false
    });
}

let moveCooldown = 0;

function handleLaneChange(direction) {
    if (moveCooldown > 0) return;
    
    if (direction === "left" && currentLane > 0) {
        currentLane--;
        moveCooldown = 8;
    } else if (direction === "right" && currentLane < road.lanes - 1) {
        currentLane++;
        moveCooldown = 8;
    }
}

function updatePlayer(deltaFactor) {
    if (moveCooldown > 0) moveCooldown -= deltaFactor;

    const m = player.speed * deltaFactor;
    if (keys.w || keys.arrowup || keys.touchUp) player.y -= m;
    if (keys.s || keys.arrowdown || keys.touchDown) player.y += m;
    player.y = Math.max(10, Math.min(canvas.height - player.height - 10, player.y));

    const targetX = laneCenters[currentLane];
    player.x += (targetX - player.x) * 0.3 * deltaFactor;
}

function rectanglesCollide(a, b) {
    const p = 6;
    return (
        a.x + p < b.x + b.width - p &&
        a.x + a.width - p > b.x + p &&
        a.y + p < b.y + b.height - p &&
        a.y + a.height - p > b.y + p
    );
}

function updateEnemies(deltaFactor) {
    spawnTimer += deltaFactor;
    const interval = Math.max(35, 90 - (gameLevel * 1.1));

    if (spawnTimer >= interval) {
        spawnEnemy();
        spawnTimer = 0;
    }

    for (const enemy of enemies) {
        enemy.y += (gameSpeed + enemy.speed * 0.4) * deltaFactor;

        if (rectanglesCollide(player, enemy)) {
            endGame();
            return;
        }

        if (!enemy.counted && enemy.y > player.y + player.height) {
            enemy.counted = true;
            carsPassed++;
            score += 10;

            gameLevel = Math.min(50, Math.floor(carsPassed / 10) + 1);
            hudLevelElement.textContent = formatLevel(gameLevel);

            if (gameLevel < 20) {
                gameSpeed = 3.0 + (gameLevel - 1) * 0.19;
            } else if (gameLevel < 50) {
                gameSpeed = 7.0 + (gameLevel - 20) * 0.25;
            } else {
                gameSpeed = 16.0;
            }
        }
    }

    enemies = enemies.filter(e => e.y < canvas.height + 150);
}

function endGame() {
    if (gameState !== "playing") return;

    gameState = "over";
    animationId = null;
    stopMusic();

    registerScoreInLeaderboard(score);

    overlayIcon.textContent = "💥";
    overlayTitle.textContent = "Perdiste";
    overlayMessage.textContent = `${username}: ${score} pts`;
    startButton.textContent = "REINTENTAR";

    startCard.classList.remove("hidden");
    nameCard.classList.add("hidden");
    overlay.classList.remove("hidden");
    drawScene();
}

function frame(timestamp) {
    if (gameState !== "playing") return;

    const deltaFactor = lastFrameTime ? Math.min((timestamp - lastFrameTime) / 16.67, 2) : 1;
    lastFrameTime = timestamp;

    updatePlayer(deltaFactor);
    updateEnemies(deltaFactor);
    hudScoreElement.textContent = formatScore(score);
    drawScene(deltaFactor);

    if (gameState === "playing") {
        animationId = requestAnimationFrame(frame);
    }
}

function startGame() {
    if (!username) {
        nameCard.classList.remove("hidden");
        startCard.classList.add("hidden");
        overlay.classList.remove("hidden");
        return;
    }

    if (animationId !== null) cancelAnimationFrame(animationId);

    currentLane = 1;
    player.x = laneCenters[currentLane];
    player.y = 500;

    enemies = [];
    score = 0;
    carsPassed = 0;
    gameLevel = 1;
    gameSpeed = 3.0;
    spawnTimer = 0;
    roadLineOffset = 0;
    biomeTimer = 0;
    transitionProgress = 0;
    currentBiomeIndex = 0;
    nextBiomeIndex = 1;
    lastFrameTime = 0;

    hudLevelElement.textContent = formatLevel(gameLevel);
    Object.keys(keys).forEach(k => { keys[k] = false; });

    gameState = "playing";
    overlay.classList.add("hidden");

    startMusic();

    hudScoreElement.textContent = formatScore(score);
    drawScene();
    animationId = requestAnimationFrame(frame);
}

function togglePause() {
    if (gameState === "playing") {
        gameState = "paused";
        if (animationId !== null) cancelAnimationFrame(animationId);
        animationId = null;
        stopMusic();
        overlayIcon.textContent = "Ⅱ";
        overlayTitle.textContent = "Pausa";
        overlayMessage.textContent = "";
        startButton.textContent = "CONTINUAR";
        startCard.classList.remove("hidden");
        nameCard.classList.add("hidden");
        overlay.classList.remove("hidden");
    } else if (gameState === "paused") {
        gameState = "playing";
        overlay.classList.add("hidden");
        startMusic();
        lastFrameTime = 0;
        animationId = requestAnimationFrame(frame);
    }
}

let touchStartX = 0;
let touchStartY = 0;

canvas.addEventListener("touchstart", e => {
    initAudio();
    if (e.touches.length > 0) {
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
    }
}, { passive: true });

canvas.addEventListener("touchmove", e => {
    if (e.touches.length > 0 && gameState === "playing") {
        const touchX = e.touches[0].clientX;
        const touchY = e.touches[0].clientY;
        const diffX = touchX - touchStartX;
        const diffY = touchY - touchStartY;

        if (Math.abs(diffX) > 25) {
            if (diffX < 0) handleLaneChange("left");
            else handleLaneChange("right");
            touchStartX = touchX;
        }

        keys.touchUp = diffY < -15;
        keys.touchDown = diffY > 15;
    }
}, { passive: true });

canvas.addEventListener("touchend", () => {
    keys.touchUp = false;
    keys.touchDown = false;
});

document.addEventListener("keydown", e => {
    initAudio();
    const k = e.key.toLowerCase();
    if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(k) && document.activeElement !== usernameInput) {
        e.preventDefault();
    }
    
    if (k === "a" || k === "arrowleft") handleLaneChange("left");
    if (k === "d" || k === "arrowright") handleLaneChange("right");

    keys[k] = true;
    if (k === "p" && !e.repeat && gameState !== "ready") togglePause();
});

document.addEventListener("keyup", e => { keys[e.key.toLowerCase()] = false; });

function setupTouchButton(id, keyName, isLaneAction, direction) {
    const btn = document.getElementById(id);
    if (!btn) return;
    
    if (isLaneAction) {
        btn.addEventListener("pointerdown", e => {
            e.preventDefault();
            initAudio();
            handleLaneChange(direction);
        });
    } else {
        const press = e => { e.preventDefault(); initAudio(); keys[keyName] = true; };
        const release = e => { e.preventDefault(); keys[keyName] = false; };
        btn.addEventListener("pointerdown", press);
        btn.addEventListener("pointerup", release);
        btn.addEventListener("pointercancel", release);
    }
}

setupTouchButton("leftBtn", "touchLeft", true, "left");
setupTouchButton("rightBtn", "touchRight", true, "right");
setupTouchButton("upBtn", "touchUp", false);
setupTouchButton("downBtn", "touchDown", false);

startButton.addEventListener("click", () => {
    initAudio();
    if (gameState === "paused") togglePause();
    else startGame();
});

drawScene();
hudScoreElement.textContent = formatScore(score);
hudLevelElement.textContent = formatLevel(gameLevel);
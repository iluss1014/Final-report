// 遊戲全域變數
let player;
let bgImg;
let playerIdleSprite;
let playerRunSprite;
let playerJumpSprite;
let kenIdleSprite;
let laoIdleSprite;
let bowserIdleSprite;
let doorClosedSprite;
let doorOpeningSprite;
let doorOpenSprite;
let ghostImg;
let ghostHint = { active: false, endTime: 0, text: "" };
let currentLevel = -1;
let fireworks = []; // 煙火陣列
let ghostJoined = false;
let pendingGhostJoin = false;
let levelsSolved = []; // 記錄已通關的層級
let quizTable; // 用於儲存 CSV 資料
let gameState = "PLAYING"; // "PLAYING" (探索中), "DIALOGUE" (對話中)
let dialogueData = { text: "", type: "MSG", options: [] }; // type: "MSG" (訊息), "Q" (問題)

// 關卡狀態
let levelState = {
  solved: false,          // 這一關是否已過關 (門是否開啟)
  currentQ: null,         // 當前抽到的題目
  doorOpenStartFrame: 0,  // 門開始開啟的幀數
  correctCount: 0         // 當前關卡已答對題數
};

// 題庫資料 (Level 1, 2, 3 對應不同提問者)
let questionsDB = {};

function preload() {
  bgImg = loadImage("background.png");
  playerIdleSprite = loadImage("zoro/zoro_idle.png");
  playerRunSprite = loadImage("zoro/zoro_run.png");
  playerJumpSprite = loadImage("zoro/zorojump.png");
  kenIdleSprite = loadImage("ken/ken待機.png");
  laoIdleSprite = loadImage("lao/lao待機.png");
  bowserIdleSprite = loadImage("bowser/庫巴待機.png");
  doorClosedSprite = loadImage("door/doorc.png");
  doorOpeningSprite = loadImage("door/doorm.png");
  doorOpenSprite = loadImage("door/dooro.png");
  ghostImg = loadImage("ghost/ghost.png");
  quizTable = loadTable("quiz.csv", "csv", "header");
}

function setup() {
  createCanvas(windowWidth, windowHeight); // 改為視窗大小
  
  // 初始化玩家
  player = {
    x: 50,
    y: 0,       // 將在 drawPlayer 中實時計算
    yOffset: 0, // 垂直偏移量 (跳躍用)
    vy: 0,      // 垂直速度
    gravity: 1.5, // 重力
    jumpForce: -30, // 跳躍力道
    size: 40,
    speed: 10,
    color: color(0, 255, 0), // 綠色玩家
    frameIndex: 0,
    direction: 1, // 1: 右, -1: 左
    state: "IDLE" // 初始狀態
  };
  
  textSize(24);

  // --- 處理 CSV 題庫 ---
  let allQuestions = [];
  // 將 CSV 資料轉換為題目物件格式
  for (let r = 0; r < quizTable.getRowCount(); r++) {
    let row = quizTable.getRow(r);
    allQuestions.push({
      q: row.getString("question"),
      options: [
        "1. " + row.getString("opt1"),
        "2. " + row.getString("opt2"),
        "3. " + row.getString("opt3"),
        "4. " + row.getString("opt4")
      ],
      ans: row.getString("answer"),
      hint: row.getString("hint")
    });
  }

  // 隨機打亂題目順序 (Shuffle)
  for (let i = allQuestions.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [allQuestions[i], allQuestions[j]] = [allQuestions[j], allQuestions[i]];
  }

  // 分配題目給 Level 1, 2, 3 (每關 2 題)
  let qIdx = 0;
  questionsDB[1] = [allQuestions[qIdx++ % allQuestions.length], allQuestions[qIdx++ % allQuestions.length]];
  questionsDB[2] = [allQuestions[qIdx++ % allQuestions.length], allQuestions[qIdx++ % allQuestions.length]];
  questionsDB[3] = [allQuestions[qIdx++ % allQuestions.length], allQuestions[qIdx++ % allQuestions.length]];
}

function draw() {
  // 0. 開始畫面
  if (currentLevel === -1) {
    background(0);
    textAlign(CENTER, CENTER);
    fill(255);
    textSize(60);
    text("迷路的索隆", width / 2, height / 2 - 50);
    textSize(30);
    text("按空格鍵開始", width / 2, height / 2 + 50);
    return;
  }

  image(bgImg, 0, 0, width, height); // 繪製背景圖並填滿視窗

  // 1. 繪製場景 (根據目前關卡)
  drawLevel();

  // 2. 繪製玩家
  drawPlayer();

  // 3. 繪製跟隨的提示精靈
  drawGhost();

  // 3. 處理移動 (如果在遊玩狀態)
  if (gameState === "PLAYING") {
    handleMovement();
  }

  // 4. 繪製 UI (對話框)
  if (gameState === "DIALOGUE") {
    drawDialogueBox();
  }
}

// --- 繪圖邏輯 ---

function drawLevel() {
  // 動態計算尺寸與位置
  let charH = height / 4;      // 角色高度為畫面 1/4
  let groundY = height * 0.75; // 地面位置在畫面 3/4 處 (底部留 1/4 給對話框)

  // 顯示關卡編號
  fill(0);
  noStroke();
  textAlign(LEFT, TOP);
  text("Level: " + currentLevel, 10, 10);

  if (currentLevel === 0) {
    // Level 0: 空白地圖，提示往右
    textAlign(CENTER, CENTER);
    // 黑底白字說明
    rectMode(CENTER);
    fill(0);
    rect(width / 2, height / 2 - 50, 450, 160); // 黑色背景框
    fill(255);
    text("歡迎來到闖關遊戲\n方向鍵移動，下方向鍵互動\n使用數字鍵答題\n請往右邊走 ->", width / 2, height / 2 - 50);
  } else if (currentLevel <= 3) {
    // Level 1~3: 提問者、提示者、門
    
    // 繪製提問者
    let npcX = width / 2;
    let npcY = groundY - charH / 2;

    if (currentLevel === 1) {
      // Level 1: 使用 Ken 精靈圖 (3幀, 鏡像)
      let totalFrames = 3;
      let frameW = kenIdleSprite.width / totalFrames;
      let frameH = kenIdleSprite.height;
      let sx = (Math.floor(frameCount / 15) % totalFrames) * frameW; // 動畫速度
      let npcW = charH * (frameW / frameH); // 保持比例

      push();
      translate(npcX, npcY);
      scale(-1, 1); // 左右鏡像翻轉
      imageMode(CENTER);
      image(kenIdleSprite, 0, 0, npcW, charH, sx, 0, frameW, frameH);
      pop();
    } else if (currentLevel === 2) {
      // Level 2: 使用 Lao 精靈圖 (4幀, 鏡像)
      let totalFrames = 4;
      let frameW = laoIdleSprite.width / totalFrames;
      let frameH = laoIdleSprite.height;
      let sx = (Math.floor(frameCount / 15) % totalFrames) * frameW;
      let npcW = charH * (frameW / frameH);

      push();
      translate(npcX, npcY);
      scale(-1, 1); // 左右鏡像翻轉
      imageMode(CENTER);
      image(laoIdleSprite, 0, 0, npcW, charH, sx, 0, frameW, frameH);
      pop();
    } else {
      // Level 3: 使用 Bowser 精靈圖 (7幀)
      let totalFrames = 7;
      let frameW = bowserIdleSprite.width / totalFrames;
      let frameH = bowserIdleSprite.height;
      let sx = (Math.floor(frameCount / 10) % totalFrames) * frameW;
      let npcW = charH * (frameW / frameH);

      push();
      translate(npcX, npcY);
      // 庫巴原圖面向左，無需翻轉即可面向左側的玩家
      imageMode(CENTER);
      image(bowserIdleSprite, 0, 0, npcW, charH, sx, 0, frameW, frameH);
      pop();
    }

    // 繪製未答題提示 (倒三角)
    if (!levelState.solved) {
      let floatY = sin(frameCount * 0.1) * 5;
      let tipX = npcX;
      let tipY = npcY - charH / 2 - 20 + floatY; // 懸浮在頭頂上方
      
      push();
      fill(255, 255, 0); // 黃色
      stroke(0);
      strokeWeight(2);
      // 倒三角形
      triangle(tipX - 10, tipY - 20, tipX + 10, tipY - 20, tipX, tipY);
      
      // 互動提示文字
      rectMode(CENTER);
      noStroke();
      fill(0, 0, 0, 150); // 半透明黑色
      rect(tipX, tipY - 45, 120, 30, 5); // 背景框
      
      fill(255);
      textAlign(CENTER, CENTER);
      textSize(16);
      text("按下鍵互動", tipX, tipY - 45);
      pop();
    }

    // 繪製門 (右側)
    let doorH = charH * 1.2; // 門變大一點
    let doorX = width - 250; // 讓門再往左一點

    if (levelState.solved) {
      // 計算動畫進度
      let elapsed = frameCount - levelState.doorOpenStartFrame;
      let speed = 10; // 動畫速度 (每10幀換一張圖)
      let openingFrames = 4;
      let openingDuration = openingFrames * speed;

      if (elapsed < openingDuration) {
        // 播放開啟過場動畫 (doorm.png, 4幀)
        let frameIndex = Math.floor(elapsed / speed);
        let frameW = doorOpeningSprite.width / openingFrames;
        let frameH = doorOpeningSprite.height;
        let sx = frameIndex * frameW;
        let doorW = doorH * (frameW / frameH);
        image(doorOpeningSprite, doorX, groundY - doorH, doorW, doorH, sx, 0, frameW, frameH);
      } else {
        // 播放已開啟狀態動畫 (dooro.png, 8幀)
        let totalFrames = 8;
        let frameW = doorOpenSprite.width / totalFrames;
        let frameH = doorOpenSprite.height;
        let sx = (Math.floor(frameCount / 10) % totalFrames) * frameW;
        let doorW = doorH * (frameW / frameH);
        image(doorOpenSprite, doorX, groundY - doorH, doorW, doorH, sx, 0, frameW, frameH);
      }
    } else {
      // 使用精靈圖繪製未開啟的門
      let totalFrames = 8;
      let frameW = doorClosedSprite.width / totalFrames;
      let frameH = doorClosedSprite.height;
      let sx = (Math.floor(frameCount / 10) % totalFrames) * frameW;
      let doorW = doorH * (frameW / frameH); // 保持比例
      image(doorClosedSprite, doorX, groundY - doorH, doorW, doorH, sx, 0, frameW, frameH);
    }
  } else {
    // 通關畫面
    
    // 1. 煙火特效邏輯
    if (random(1) < 0.15) { // 提高機率至 15% (變多)
      fireworks.push(new Firework());
    }
    for (let i = fireworks.length - 1; i >= 0; i--) {
      fireworks[i].update();
      fireworks[i].show();
      if (fireworks[i].done()) {
        fireworks.splice(i, 1);
      }
    }

    // 2. 美化文字
    textAlign(CENTER, CENTER);
    push();
    drawingContext.shadowBlur = 30; // 發光效果
    drawingContext.shadowColor = color(255, 215, 0);
    fill(255, 215, 0); // 金色
    textSize(60);
    text("恭喜通關！", width / 2, height / 2 - 40);
    pop();

    // 3. 副標題
    fill(255, 255, 255, 150); // 改為半透明白色
    textSize(24);
    text("雖然還是迷路在洞窟就是了", width / 2, height / 2 + 40);

    // 4. 觸碰觸發額外煙火
    if (dist(player.x, player.y, width / 2, height / 2 - 40) < 100) {
      if (frameCount % 10 === 0) {
         // 從兩側發射 (包含斜上方效果)
         fireworks.push(new Firework(0, random(height * 0.3, height), random(8, 15), random(-15, -8)));
         // 右側發射
         fireworks.push(new Firework(width, random(height * 0.3, height), random(-15, -8), random(-15, -8)));
      }
    }
  }
}

function drawPlayer() {
  // 動態計算尺寸與位置
  let charH = height / 4;
  let groundY = height * 0.75;
  
  // --- 物理運算 (跳躍與重力) ---
  if (gameState === "PLAYING") {
    player.yOffset += player.vy;
    player.vy += player.gravity;

    // 地板碰撞檢查
    if (player.yOffset > 0) {
      player.yOffset = 0;
      player.vy = 0;
    }
  }
  // 更新玩家 Y 座標：基準地面位置 + 跳躍偏移
  player.y = (groundY - charH / 2) + player.yOffset;

  // 判斷是否在移動並更新方向
  let isMoving = false;
  if (gameState === "PLAYING") {
    if (keyIsDown(LEFT_ARROW)) {
      player.direction = -1;
      isMoving = true;
    } else if (keyIsDown(RIGHT_ARROW)) {
      player.direction = 1;
      isMoving = true;
    }
  }

  // 決定使用的精靈圖和幀數
  let newState;
  if (player.yOffset < 0) {
    newState = "JUMP";
  } else if (isMoving) {
    newState = "RUN";
  } else {
    newState = "IDLE";
  }

  // 如果狀態改變 (例如從地板跳起，或落地)，重置動畫幀數
  if (player.state !== newState) {
    player.state = newState;
    player.frameIndex = 0;
  }

  let spriteSheet;
  let totalFrames;
  let frameDelay; // 控制動畫速度 (數字越小越快)

  if (player.state === "JUMP") {
    spriteSheet = playerJumpSprite;
    totalFrames = 13;
    frameDelay = 3; // 跳躍動畫要快 (每3幀換一張)
  } else if (player.state === "RUN") {
    spriteSheet = playerRunSprite;
    totalFrames = 8;
    frameDelay = 5; // 跑步速度適中
  } else { // IDLE
    spriteSheet = playerIdleSprite;
    totalFrames = 8;
    frameDelay = 10; // 待機慢一點
  }

  // 動畫播放更新
  if (frameCount % frameDelay === 0) {
    player.frameIndex = (player.frameIndex + 1) % totalFrames;
  }

  push();
  translate(player.x, player.y);
  scale(player.direction, 1); // 根據方向翻轉
  imageMode(CENTER);
  
  // 動態計算單張畫面的寬度與高度 (解決精靈圖切割錯誤問題)
  let frameW = spriteSheet.width / totalFrames;
  let frameH = spriteSheet.height;
  
  // 計算圖片顯示寬度 (維持比例)
  let charW = charH * (frameW / frameH);
  
  // 繪製精靈圖
  let sx = player.frameIndex * frameW;
  image(spriteSheet, 0, 0, charW, charH, sx, 0, frameW, frameH);
  pop();
}

function drawDialogueBox() {
  // 仿 Undertale 風格：下方黑色區塊，白色邊框
  rectMode(CORNER);
  fill(0);
  stroke(255);
  strokeWeight(4);
  
  // 修改排版：加高對話框，避免文字超出
  let boxH = 220;
  let boxY = height - boxH - 20;
  rect(50, boxY, width - 100, boxH);
  
  // 文字內容
  noStroke();
  fill(255);
  textAlign(LEFT, TOP);
  
  textSize(30);
  text(dialogueData.text, 70, boxY + 20, width - 140, 90);

  // 如果是問題，顯示選項
  if (dialogueData.type === "Q") {
    textSize(24); // 選項字體放大
    let optY1 = boxY + 110;
    let optY2 = boxY + 150;
    text(dialogueData.options[0], 70, optY1);
    text(dialogueData.options[1], width / 2, optY1); // 第二列改用相對位置
    text(dialogueData.options[2], 70, optY2);
    text(dialogueData.options[3], width / 2, optY2);
    textSize(20);
    fill(200);
    text("[按 1-4 回答，按 下鍵 再想想，按 0 提示]", 70, boxY + boxH - 30);
  } else {
    textSize(26);
    fill(200);
    text("[按 下鍵 繼續]", width - 280, boxY + boxH - 30);
  }
}

// --- 邏輯控制 ---

function handleMovement() {
  if (keyIsDown(LEFT_ARROW)) player.x -= player.speed;
  if (keyIsDown(RIGHT_ARROW)) player.x += player.speed;

  // 1. 左側邊界 (回到上一關)
  if (player.x < 0) {
    if (currentLevel > 0) {
      currentLevel--;
      // 回到上一關時，假設該關卡已解開
      if (currentLevel >= 1 && currentLevel <= 3) {
        levelState.solved = true;
        levelState.doorOpenStartFrame = frameCount - 1000; // 讓門保持開啟動畫結束狀態
        player.x = width - 280; // 出現在門的左側
      } else {
        player.x = width - 50;
      }
    } else {
      player.x = 0;
    }
  }

  // 2. 右側邊界
  // 如果是 Level 1-3，邊界在門的位置 (width - 230 附近)，否則在畫面邊緣
  let boundaryX = (currentLevel >= 1 && currentLevel <= 3) ? width - 230 : width;

  if (player.x > boundaryX) {
    if (currentLevel === 0) {
      nextLevel();
    } else if (currentLevel > 3) {
      // 通關後的畫面，擋住但不顯示訊息
      player.x = boundaryX - 10;
    } else if (levelState.solved) {
      nextLevel();
    } else {
      player.x = boundaryX - 10; // 門沒開，擋住
      showDialogue("門鎖住了！你需要回答正確問題才能通過。", "MSG");
    }
  }
}

// --- 煙火特效類別 ---

class Firework {
  constructor(x, y, vx, vy) {
    this.hu = random(255);
    let startX = (x !== undefined) ? x : random(width);
    let startY = (y !== undefined) ? y : height;
    this.firework = new Particle(startX, startY, true, this.hu);
    if (vx !== undefined && vy !== undefined) {
      this.firework.vel = createVector(vx, vy);
    }
    this.exploded = false;
    this.particles = [];
  }

  done() {
    return this.exploded && this.particles.length === 0;
  }

  update() {
    if (!this.exploded) {
      this.firework.applyForce(createVector(0, 0.2)); // 重力
      this.firework.update();
      if (this.firework.vel.y >= 0) {
        this.exploded = true;
        this.explode();
      }
    }
    for (let i = this.particles.length - 1; i >= 0; i--) {
      this.particles[i].applyForce(createVector(0, 0.2));
      this.particles[i].update();
      if (this.particles[i].done()) {
        this.particles.splice(i, 1);
      }
    }
  }

  explode() {
    for (let i = 0; i < 200; i++) { // 增加粒子數量 (更密)
      let p = new Particle(this.firework.pos.x, this.firework.pos.y, false, this.hu);
      this.particles.push(p);
    }
  }

  show() {
    if (!this.exploded) {
      this.firework.show();
    }
    for (let i = 0; i < this.particles.length; i++) {
      this.particles[i].show();
    }
  }
}

class Particle {
  constructor(x, y, firework, hu) {
    this.pos = createVector(x, y);
    this.firework = firework;
    this.lifespan = 255;
    this.hu = hu;
    this.acc = createVector(0, 0);
    if (this.firework) {
      this.vel = createVector(0, random(-18, -10)); // 提高發射高度
    } else {
      this.vel = p5.Vector.random2D();
      this.vel.mult(random(5, 20)); // 增加爆炸擴散範圍 (變大)
    }
  }

  applyForce(force) {
    this.acc.add(force);
  }

  update() {
    if (!this.firework) {
      this.vel.mult(0.9); // 空氣阻力
      this.lifespan -= 4; // 消失速度
    }
    this.vel.add(this.acc);
    this.pos.add(this.vel);
    this.acc.mult(0);
  }

  done() {
    return this.lifespan < 0;
  }

  show() {
    colorMode(HSB, 255); // 切換到 HSB 模式以顯示彩虹色
    if (!this.firework) {
      strokeWeight(4); // 粒子變粗
      stroke(this.hu, 255, 255, this.lifespan);
    } else {
      strokeWeight(6); // 發射點變粗
      stroke(this.hu, 255, 255);
    }
    point(this.pos.x, this.pos.y);
    colorMode(RGB, 255); // 切換回 RGB 模式以免影響其他繪圖
  }
}

function nextLevel() {
  currentLevel++;
  player.x = 50; // 出現在左側
  
  // 檢查該關卡是否已經解鎖過
  if (levelsSolved[currentLevel]) {
    levelState.solved = true;
    levelState.doorOpenStartFrame = frameCount - 1000; // 讓門保持開啟狀態 (跳過開啟動畫)
  } else {
    levelState.solved = false; // 重置關卡狀態
    levelState.correctCount = 0; // 重置答對題數
  }
  
  levelState.currentQ = null; // 重置題目
}

function keyPressed() {
  if (currentLevel === -1) {
    if (key === ' ') {
      currentLevel = 0;
    }
    return;
  }

  if (gameState === "PLAYING") {
    if (keyCode === DOWN_ARROW) { // 改成下鍵互動
      checkInteraction();
    }
    if (keyCode === UP_ARROW && player.yOffset === 0) { // 向上鍵跳躍 (只能在地板上跳)
      player.vy = player.jumpForce;
    }
  } else if (gameState === "DIALOGUE") {
    if (dialogueData.type === "MSG") {
      if (keyCode === DOWN_ARROW) gameState = "PLAYING"; // 關閉對話
      
      if (pendingGhostJoin && gameState === "PLAYING") {
        ghostJoined = true;
        pendingGhostJoin = false;
      }

      // 新增：按 0 顯示提示
      if (key === '0' && levelState.currentQ) {
        ghostHint.text = levelState.currentQ.hint;
        ghostHint.active = true;
        ghostHint.endTime = millis() + 5000;
      }
    } else if (dialogueData.type === "Q") {
      if (key === '1') checkAnswer(0);
      if (key === '2') checkAnswer(1);
      if (key === '3') checkAnswer(2);
      if (key === '4') checkAnswer(3);
      if (keyCode === DOWN_ARROW) gameState = "PLAYING"; // 取消作答 (再想想)
      // 新增：在題目介面直接按 0 顯示提示
      if (key === '0' && levelState.currentQ) {
        ghostHint.text = levelState.currentQ.hint;
        ghostHint.active = true;
        ghostHint.endTime = millis() + 5000;
      }
    }
  }
}

function checkInteraction() {
  if (currentLevel >= 1 && currentLevel <= 3) {
    // 動態計算互動判斷的 Y 座標
    let charH = height / 4;
    let groundY = height * 0.75;
    let npcY = groundY - charH / 2; // NPC 中心點
    
    // 2. 檢查與提問者的距離 (中間)
    let dQ = dist(player.x, player.y, width / 2, npcY); 
    if (dQ < charH) { // 距離判定也隨身高縮放
      if (levelState.solved) {
        showDialogue("門已經開了，快前往下一關吧！", "MSG");
      } else {
        // 抽題邏輯：如果還沒抽過，依序抽題
        if (!levelState.currentQ) {
          levelState.currentQ = questionsDB[currentLevel][levelState.correctCount];
        }
        showDialogue(levelState.currentQ.q, "Q", levelState.currentQ.options);
      }
      return;
    }
  }
}

function showDialogue(txt, type, opts = []) {
  gameState = "DIALOGUE";
  dialogueData = { text: txt, type: type, options: opts };
}

function checkAnswer(optionIndex) {
  // 選項是 "1. xxx", 我們取第一個字元 '1' 或 '2' 來比對
  let selectedAns = (optionIndex + 1).toString();
  if (selectedAns === levelState.currentQ.ans) {
    levelState.correctCount++;
    levelState.currentQ = null; // 清除當前題目，以便下次互動抽取下一題

    if (levelState.correctCount >= 2) {
      levelState.solved = true;
      levelsSolved[currentLevel] = true; // 標記此關卡已解鎖
      levelState.doorOpenStartFrame = frameCount; // 紀錄開啟時間
      showDialogue("回答正確！門打開了。", "MSG");
    } else {
      showDialogue("回答正確！還需要回答 1 題。", "MSG");
    }
  } else {
    showDialogue("回答錯誤... (按 0 查看提示)", "MSG");
  }
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

function drawGhost() {
  let charH = height / 4;
  let ghostSize = charH / 3;
  let gx, gy, facing;
  let shouldDraw = false;

  if (ghostJoined) {
    // 跟隨模式 (Level 0~3)
    if (currentLevel >= 0 && currentLevel <= 3) {
      let offsetX = charH * 0.5; 
      let offsetY = charH * 0.5;
      gx = player.x - (player.direction * offsetX);
      gy = player.y - offsetY + sin(frameCount * 0.05) * 10;
      facing = player.direction;
      shouldDraw = true;
    }
  } else {
    // 定點模式 (Level 0)
    if (currentLevel === 0) {
      gx = width / 2;
      gy = (height * 0.75) - (charH / 2) + sin(frameCount * 0.05) * 10;
      facing = (player.x < gx) ? -1 : 1; // 面向玩家
      shouldDraw = true;

      // 觸發對話
      if (gameState === "PLAYING" && !pendingGhostJoin) {
        if (dist(player.x, player.y, gx, gy) < charH) {
          showDialogue("我是來幫助你通關的", "MSG");
          pendingGhostJoin = true;
        }
      }
    }
  }

  if (!shouldDraw) return;

  // 繪製精靈圖 (2幀動畫)
  let totalFrames = 2;
  let frameW = ghostImg.width / totalFrames;
  let frameH = ghostImg.height;
  let sx = (Math.floor(frameCount / 30) % totalFrames) * frameW;

  push();
  translate(gx, gy);
  scale(facing, 1); 
  imageMode(CENTER);
  image(ghostImg, 0, 0, ghostSize, ghostSize, sx, 0, frameW, frameH);
  pop();

  // 顯示提示氣泡
  if (ghostHint.active) {
    if (millis() < ghostHint.endTime) {
      push();
      translate(gx, gy - ghostSize/2 - 30);
      
      textSize(16);
      let maxW = 350;
      let padding = 20;
      let txtW = textWidth(ghostHint.text);
      
      // 計算對話框寬度 (限制在 100 ~ maxW 之間)
      let boxW = constrain(txtW + padding * 2, 100, maxW);
      let contentW = boxW - padding * 2;
      
      // 估算行數 (稍微寬鬆一點以免切字)
      // 修正：考慮換行造成的空間浪費，假設每行只有 80% 的利用率
      let lines = Math.ceil(txtW / (contentW * 0.8));
      if (lines < 1) lines = 1;
      // 增加一點高度緩衝，避免文字貼邊
      let lineHeight = 24;
      let boxH = lines * lineHeight + padding * 2;

      // --- 修正定位邏輯 ---
      // 將原點移動到對話框的「左上角」
      translate(-boxW / 2, -boxH / 2);

      fill(255);
      stroke(0);
      rectMode(CORNER); // 改為從角落繪製
      rect(0, 0, boxW, boxH, 10);
      
      fill(0);
      noStroke();
      textAlign(CENTER, CENTER);
      // 文字框也從 (0,0) 開始，大小與矩形完全一致
      text(ghostHint.text, 0, 0, boxW, boxH);
      pop();
    } else {
      ghostHint.active = false;
    }
  }
}

function mousePressed() {
  if (currentLevel >= 1 && currentLevel <= 3) {
    let charH = height / 4;
    let ghostSize = charH / 3;
    let offsetX = charH * 0.5;
    let offsetY = charH * 0.5;
    
    // 重新計算幽靈位置以進行點擊判定
    let gx = player.x - (player.direction * offsetX);
    let gy = player.y - offsetY + sin(frameCount * 0.05) * 10;

    // 簡單的圓形碰撞判定
    if (dist(mouseX, mouseY, gx, gy) < ghostSize) {
      let txt = "";
      if (levelState.solved) {
        txt = "門開了，快走吧！";
      } else if (levelState.currentQ) {
        txt = levelState.currentQ.hint;
      } else {
        txt = "你還沒看過題目呢...";
      }
      ghostHint.text = txt;
      ghostHint.active = true;
      ghostHint.endTime = millis() + 5000; // 顯示 5 秒
    }
  }
}

-- CreateTable
CREATE TABLE "GameSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" DATETIME,
    "globalRule" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "winnerBotId" TEXT,
    "maxRounds" INTEGER NOT NULL,
    "currentRound" INTEGER NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "GameBot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "basePrompt" TEXT,
    "order" INTEGER NOT NULL,
    "finalScore" INTEGER NOT NULL DEFAULT 0,
    "skillSnapshots" TEXT NOT NULL DEFAULT '[]',
    CONSTRAINT "GameBot_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Round" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "sessionId" TEXT NOT NULL,
    "roundNumber" INTEGER NOT NULL,
    "startedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" DATETIME,
    CONSTRAINT "Round_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "GameSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "roundId" TEXT NOT NULL,
    "gameBotId" TEXT,
    "content" TEXT NOT NULL,
    "skillSnapshot" TEXT NOT NULL DEFAULT '{}',
    "role" TEXT NOT NULL DEFAULT 'assistant',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_roundId_fkey" FOREIGN KEY ("roundId") REFERENCES "Round" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Message_gameBotId_fkey" FOREIGN KEY ("gameBotId") REFERENCES "GameBot" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Skill" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" TEXT NOT NULL DEFAULT 'ROLE_PLAY',
    "content" TEXT NOT NULL,
    "author" TEXT,
    "version" TEXT NOT NULL DEFAULT '1.0.0',
    "preview" TEXT,
    "tags" TEXT NOT NULL DEFAULT '[]',
    "isPublic" BOOLEAN NOT NULL DEFAULT true,
    "downloads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

// server.js
const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
require('dotenv').config();

const User = require('./models/User');

const app = express();
const PORT = process.env.PORT || 3000;

// The BASE_RATE is set so that over one minute at power 1.0 you earn 0.003472 tokens.
// With a 10-second interval, we use BASE_RATE = 0.003472/6.
const ENV = {
  BASE_RATE: 0.003472 / 6
};

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('MongoDB connected'))
.catch(err => console.error('MongoDB connection error:', err));

// Middleware
app.use(bodyParser.json());
app.use(express.static('public'));

// Helper: Generate a random 10-digit code as a string.
function generateDailyCode() {
  return Math.floor(1000000000 + Math.random() * 9000000000).toString();
}

// ========== API Endpoints ==========

/**
 * POST /initUser
 * Initializes a user session using Telegram data.
 */
app.post('/initUser', async (req, res) => {
  try {
    const tgUser = req.body;
    if (!tgUser || !tgUser.id) {
      return res.status(400).json({ error: "Invalid Telegram user data" });
    }
    
    let user = await User.findOne({ telegramId: tgUser.id });
    if (!user) {
      user = new User({
        telegramId: tgUser.id,
        username: tgUser.username || `user_${tgUser.id}`,
        firstName: tgUser.first_name,
        lastName: tgUser.last_name || ''
      });
      await user.save();
    }
    res.json(user);
  } catch (err) {
    console.error("Error in initUser:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * POST /toggleMining
 * Starts mining for a user, generates a unique 10-digit daily code, and resets daily bonus fields.
 */
app.post('/toggleMining', async (req, res) => {
  try {
    const { telegramId } = req.body;
    if (!telegramId) return res.status(400).json({ error: "telegramId required" });
    
    let user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: "User not found" });
    
    if (user.miningActive) {
      return res.status(400).json({ message: "Mining already active." });
    }
    
    user.miningActive = true;
    // Generate a daily code and record the generation time.
    user.dailyCode = generateDailyCode();
    user.dailyCodeGeneratedAt = new Date();
    user.codeSubmissions = 0;
    user.hasSubmittedBonus = false;
    await user.save();
    
    res.json({ message: "Mining started", user });
  } catch (err) {
    console.error("Error in toggleMining:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * POST /submitCode
 * Allows a user (submitter) to submit another user's daily code.
 * - The submitter gains a bonus of +0.5x if they haven’t already submitted a code today.
 * - The owner of the code gains +0.1x per valid submission (up to 10 submissions).
 */
app.post('/submitCode', async (req, res) => {
  try {
    const { submitterTelegramId, code } = req.body;
    if (!submitterTelegramId || !code) return res.status(400).json({ error: "submitterTelegramId and code required" });
    
    // Find the submitter.
    let submitter = await User.findOne({ telegramId: submitterTelegramId });
    if (!submitter) return res.status(404).json({ error: "Submitter not found" });
    
    // Check if the submitter has already submitted a code today.
    if (submitter.hasSubmittedBonus) {
      return res.status(400).json({ message: "You have already submitted a code today." });
    }
    
    // Find the owner of the code.
    let owner = await User.findOne({ dailyCode: code });
    if (!owner) {
      return res.status(400).json({ message: "Invalid code." });
    }
    
    // Verify the code is valid (generated within the last 24 hours).
    const now = new Date();
    if (!owner.dailyCodeGeneratedAt || (now - owner.dailyCodeGeneratedAt) > 24 * 60 * 60 * 1000) {
      return res.status(400).json({ message: "Code expired." });
    }
    
    // Prevent users from submitting their own code.
    if (submitter.telegramId === owner.telegramId) {
      return res.status(400).json({ message: "You cannot submit your own code." });
    }
    
    // Ensure the owner's code has not reached the maximum of 10 submissions.
    if (owner.codeSubmissions >= 10) {
      return res.status(400).json({ message: "This code has reached the maximum submission limit." });
    }
    
    // Update the owner and submitter bonus fields.
    owner.codeSubmissions += 1;
    await owner.save();
    
    submitter.hasSubmittedBonus = true;
    await submitter.save();
    
    res.json({ message: "Code submitted successfully." });
  } catch (err) {
    console.error("Error in submitCode:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * GET /user/:telegramId
 * Retrieves user data and calculates the effective mining multiplier.
 */
app.get('/user/:telegramId', async (req, res) => {
  try {
    const telegramId = parseInt(req.params.telegramId);
    const user = await User.findOne({ telegramId });
    if (!user) return res.status(404).json({ error: "User not found" });
    
    // Effective multiplier: default 1.0 + bonus from submitted code (+0.5) + bonus from others submitting this user's code (0.1 per submission)
    const effectiveMultiplier = 1.0 + (user.hasSubmittedBonus ? 0.5 : 0) + (0.1 * user.codeSubmissions);
    const userData = {
      telegramId: user.telegramId,
      username: user.username,
      balance: user.balance,
      miningActive: user.miningActive,
      effectiveMultiplier: effectiveMultiplier,
      dailyCode: user.dailyCode
    };
    res.json(userData);
  } catch (err) {
    console.error("Error in fetching user:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

/**
 * GET /totalMined
 * Returns the total mined tokens from all users.
 */
app.get('/totalMined', async (req, res) => {
  try {
    const users = await User.find({});
    const totalMined = users.reduce((acc, user) => acc + (user.balance || 0), 0);
    res.json({ totalMined });
  } catch (err) {
    console.error("Error in totalMined:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// ========== Background Tasks ==========

// Mining accrual: Every 10 seconds, update the balance of every active miner.
setInterval(async () => {
  try {
    const activeUsers = await User.find({ miningActive: true });
    for (let user of activeUsers) {
      const effectiveMultiplier = 1.0 + (user.hasSubmittedBonus ? 0.5 : 0) + (0.1 * user.codeSubmissions);
      const earnings = ENV.BASE_RATE * effectiveMultiplier;
      user.balance += earnings;
      user.lastUpdated = new Date();
      await user.save();
    }
  } catch (err) {
    console.error("Error in mining accrual:", err);
  }
}, 10000);

// Daily reset at midnight UTC: Reset mining activity and daily bonus fields.
function scheduleMidnightReset() {
  const now = new Date();
  const nextMidnightUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  const millisTillMidnight = nextMidnightUTC.getTime() - now.getTime();
  
  setTimeout(async () => {
    try {
      await User.updateMany(
        { miningActive: true },
        {
          $set: {
            miningActive: false,
            dailyCode: null,
            dailyCodeGeneratedAt: null,
            codeSubmissions: 0,
            hasSubmittedBonus: false
          }
        }
      );
      console.log("Daily reset completed at midnight UTC.");
    } catch (err) {
      console.error("Error during daily reset:", err);
    }
    scheduleMidnightReset();
  }, millisTillMidnight);
}
scheduleMidnightReset();

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

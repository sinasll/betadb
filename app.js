// public/app.js

// For demonstration, we use dummy Telegram user data.
// In your Telegram WebApp, obtain the user data via Telegram's API.
const tgUser = {
  id: 123456,
  username: "exampleUser",
  first_name: "Example",
  last_name: "User"
};

// Initialize user session.
function initUser() {
  fetch('/initUser', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify(tgUser)
  })
  .then(resp => resp.json())
  .then(user => {
    console.log(user);  // Add this line to log the returned user
    updateUserUI(user);
  })
  .catch(err => console.error("Error initializing user:", err));
}

// Start mining when the button is clicked.
document.getElementById('mineButton').addEventListener('click', () => {
  fetch('/toggleMining', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ telegramId: tgUser.id })
  })
  .then(resp => resp.json())
  .then(data => {
    if (data.message) {
      alert(data.message);
    }
    updateUserUI(data.user);
  })
  .catch(err => console.error("Error toggling mining:", err));
});


// Submit a code.
document.getElementById('submitCodeButton').addEventListener('click', () => {
  const codeInput = document.getElementById('submitCodeInput');
  const code = codeInput.value.trim();
  if (code.length !== 10) {
    alert("Please enter a valid 10-digit code.");
    return;
  }
  fetch('/submitCode', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ submitterTelegramId: tgUser.id, code: code })
  })
  .then(resp => resp.json())
  .then(data => {
    alert(data.message);
    codeInput.value = '';
  })
  .catch(err => console.error("Error submitting code:", err));
});

// Poll for updated user data and total mined value.
function pollData() {
  fetch('/user/' + tgUser.id)
  .then(resp => resp.json())
  .then(user => {
    updateUserUI(user);
  })
  .catch(err => console.error("Error fetching user data:", err));

  fetch('/totalMined')
  .then(resp => resp.json())
  .then(data => {
    document.getElementById('mined').textContent = parseFloat(data.totalMined).toFixed(2);
  })
  .catch(err => console.error("Error fetching total mined:", err));
}

// Update user interface elements.
function updateUserUI(user) {
  document.getElementById('username').textContent = user.username;
  document.getElementById('balance').textContent = parseFloat(user.balance).toFixed(2);
  document.getElementById('power').textContent = parseFloat(user.effectiveMultiplier).toFixed(1);
  document.getElementById('dailyCode').textContent = user.dailyCode || "Not generated";
}

// Countdown timer for daily reset.
function startCountdown() {
  setInterval(() => {
    const now = new Date();
    const nextDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
    const timeLeft = nextDay - now;
    const hours = Math.floor(timeLeft / (1000 * 60 * 60));
    const minutes = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((timeLeft % (1000 * 60)) / 1000);
    document.getElementById('countdown').textContent =
      `Daily reset in ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
  }, 1000);
}

initUser();
startCountdown();
setInterval(pollData, 5000);

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getDatabase, ref, set, get, push, onValue, update, query, orderByChild, limitToLast } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-database.js';
import { getAuth, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBuioOF7DCq-qIoa1D6ZyZbrAVeGjbfv3Y",
  authDomain: "daily-campaign-king.firebaseapp.com",
  databaseURL: "https://daily-campaign-king-default-rtdb.firebaseio.com",
  projectId: "daily-campaign-king",
  storageBucket: "daily-campaign-king.appspot.com",
  messagingSenderId: "1089692268059",
  appId: "1:1089692268059:web:eddde94901436202576abe",
  measurementId: "G-6PXV3B5322"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// Game Constants
const HANDLING_FEE = 1;
const NUMBER_WIN_MULTIPLIER = 10; // Changed from 9 to 10 for correct payout
const COLOR_WIN_MULTIPLIER = 2; // Changed from 1.8 to 2 for correct payout
const BIGSMALL_WIN_MULTIPLIER = 2; // Changed from 1.8 to 2 for correct payout
const MAX_BET = 10000000;
const CYCLE_DURATION = 60 * 1000; // 1 minute in milliseconds
const RESULT_GENERATION_TIME = 5; // Generate result 5 seconds before the end
const RESULT_DISPLAY_TIME = 4; // Display result at 4 seconds remaining

const SECRET_HOOK = 40;




// Betting System Variables
let balanceValue = 1;
let quantity = 1;
let multiplier = 1;
let agreed = true;
let currentUser = null;
let userBalance = 0;
let selectedElement = null;
let betType = ''; // 'number', 'color', 'bigSmall'
let currentGamePeriod = 2025050645001;
let gameResults = {};
let allBets = {};
let betStatistics = {
  numbers: {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0},
  colors: { red: 0, green: 0, violet: 0 },
  bigSmall: { big: 0, small: 0 }
};
let timerInterval = null;
let countdownInterval = null;
let resultDisplayTimeout = null;
let userPlacedBets = false;
let cycleStartTime = null;
let resultsProcessed = false;
let resultGenerated = false;
let serverTimeOffset = 0;
let currentHistoryPage = 1;
let totalHistoryPages = 1;
let cachedHistoryData = []; // Cache for history data
let userHistoryData = []; // User's betting history
let currentHistoryTab = 'game'; // 'game' or 'user'
let historyTabInitialized = false; // Flag to track if user history has been initialized

// Number color mapping
const numberColors = {
  0: { colors: ['red', 'violet'], size: 'small' },
  1: { colors: ['green'], size: 'small' },
  2: { colors: ['red'], size: 'small' },
  3: { colors: ['green'], size: 'small' },
  4: { colors: ['red'], size: 'small' },
  5: { colors: ['green', 'violet'], size: 'big' },
  6: { colors: ['red'], size: 'big' },
  7: { colors: ['green'], size: 'big' },
  8: { colors: ['red'], size: 'big' },
  9: { colors: ['green'], size: 'big' }
};

// Light background colors for random selection
const lightColors = [
  '#FFD700', '#87CEEB', '#FFA07A', '#98FB98',
  '#FFB6C1', '#E0FFFF', '#F5DEB3', '#DDA0DD',
  '#B0E0E6', '#FAFAD2', '#EEE8AA', '#FFDEAD'
];

// Format number in Indian style (1,000 vs 1000)
function formatIndianNumber(num) {
  return new Intl.NumberFormat('en-IN').format(num);
}

// ======== TOAST NOTIFICATION SYSTEM ========


















// Initialize toast styles
function initializeToast() {
  try {
    // Check if styles already exist
    if (document.querySelector('#toast-styles')) {
      return;
    }
    
    const toastStyles = document.createElement('style');
    toastStyles.id = 'toast-styles';
    toastStyles.textContent = `
      .advanced-toast {
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 15px 20px;
        border-radius: 8px;
        color: white;
        display: flex;
        align-items: center;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transform: translateX(150%);
        transition: transform 0.3s ease-out;
        z-index: 1000;
        overflow: hidden;
      }
      .advanced-toast.show {
        transform: translateX(0);
      }
      .advanced-toast.success {
        background: linear-gradient(135deg, #4CAF50, #2E7D32);
      }
      .advanced-toast.error {
        background: linear-gradient(135deg, #F44336, #C62828);
      }
      .toast-icon {
        font-size: 20px;
        margin-right: 10px;
      }
      .toast-message {
        font-size: 14px;
      }
      .toast-progress {
        position: absolute;
        bottom: 0;
        left: 0;
        height: 4px;
        width: 100%;
        background: rgba(255,255,255,0.3);
      }
      .toast-progress::after {
        content: '';
        position: absolute;
        bottom: 0;
        left: 0;
        height: 100%;
        width: 100%;
        background: white;
        animation: progress 3s linear forwards;
      }
      @keyframes progress {
        0% { width: 100%; }
        100% { width: 0%; }
      }
      .body_overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-color: rgba(0,0,0,0.5);
        z-index: 90;
        display: none;
      }
      .body_overlay.active {
        display: block;
      }
      
      /* Win/Loss Animation Styles */
      .OverlayLayouts, .OverlayLayouts_LOSE {
        animation: fadeIn 0.3s ease-out;
      }
      
      @keyframes fadeIn {
        from { opacity: 0; transform: scale(0.9); }
        to { opacity: 1; transform: scale(1); }
      }
      
      /* Add animation to result display */
      .ResultsValue {
        animation: pulse 1s infinite alternate;
      }
      
      @keyframes pulse {
        from { transform: scale(1); }
        to { transform: scale(1.05); }
      }
      
      /* User history container */
      .user-history-container {
        max-height: 400px;
        overflow-y: auto;
        padding: 10px;
        border-radius: 8px;
        background-color: #f9f9f9;
        box-shadow: inset 0 0 5px rgba(0,0,0,0.1);
        margin-top: 10px;
      }

      /* User history styles */
      .user-history-row {
        padding: 15px;
        margin: 10px 0;
        border-radius: 10px;
        display: flex;
        justify-content: space-between;
        align-items: center;
        box-shadow: 0 3px 10px rgba(0,0,0,0.1);
        transition: all 0.3s ease;
        position: relative;
        overflow: hidden;
        background: white;
        border: 1px solid rgba(0,0,0,0.05);
      }
      
      .user-history-row:hover {
        transform: translateY(-3px);
        box-shadow: 0 6px 15px rgba(0,0,0,0.15);
      }
      
      .user-history-row::before {
        content: '';
        position: absolute;
        top: 0;
        left: 0;
        width: 5px;
        height: 100%;
      }
      
      .user-history-win {
        background: linear-gradient(to right, rgba(39, 174, 96, 0.05), white 15%);
      }
      
      .user-history-win::before {
        background: linear-gradient(to bottom, #27ae60, #2ecc71);
      }
      
      .user-history-lose {
        background: linear-gradient(to right, rgba(231, 76, 60, 0.05), white 15%);
      }
      
      .user-history-lose::before {
        background: linear-gradient(to bottom, #e74c3c, #f05a5a);
      }
      
      .user-history-period {
        font-weight: bold;
        font-size: 14px;
        color: #333;
        text-shadow: 0 1px 0 rgba(255,255,255,0.5);
        background: rgba(0,0,0,0.05);
        padding: 5px 10px;
        border-radius: 20px;
      }
      
      .user-history-details {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
      }
      
      .user-history-bet-type {
        font-size: 12px;
        color: #666;
        background: rgba(0,0,0,0.03);
        padding: 2px 8px;
        border-radius: 12px;
      }
      
      .user-history-result {
        display: flex;
        gap: 15px;
        align-items: center;
      }
      
      .user-history-value {
        display: inline-block;
        padding: 5px 10px;
        border-radius: 6px;
        font-weight: bold;
        font-size: 14px;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
      }
      
      .user-history-win .user-history-value {
        background: linear-gradient(135deg, #27ae60, #2ecc71);
        color: white;
      }
      
      .user-history-lose .user-history-value {
        background: linear-gradient(135deg, #e74c3c, #f05a5a);
        color: white;
      }
      
      .user-history-amount {
        font-weight: bold;
        font-size: 18px;
        text-shadow: 0 1px 0 rgba(0,0,0,0.1);
        padding: 5px 10px;
        border-radius: 5px;
      }
      
      .user-history-win .user-history-amount {
        color: #27ae60;
        background-color: rgba(39, 174, 96, 0.1);
      }
      
      .user-history-lose .user-history-amount {
        color: #e74c3c;
        background-color: rgba(231, 76, 60, 0.1);
      }
      
      /* Active tab styling */
      .gh-tab {
        transition: all 0.3s ease;
        cursor: pointer;
        padding: 10px 15px;
        border-radius: 5px;
      }
      
      .gh-tab:hover {
        background-color: rgba(0,0,0,0.05);
      }
      
      .gh-tab.active {
        color: #fff;
        background: linear-gradient(135deg, #4CAF50, #2E7D32);
        border-radius: 5px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
      }
      
      /* Empty history message */
      .empty-history-message {
        text-align: center;
        padding: 30px 15px;
        color: #999;
        font-style: italic;
        background-color: rgba(0,0,0,0.02);
        border-radius: 8px;
        margin: 20px 0;
        border: 1px dashed #ddd;
      }
      
      /* New badge for latest result */
      .latest-result-badge {
        position: absolute;
        top: -8px;
        right: -8px;
        background: linear-gradient(135deg, #FF5722, #FF9800);
        color: white;
        font-size: 10px;
        padding: 3px 8px;
        border-radius: 10px;
        box-shadow: 0 2px 5px rgba(0,0,0,0.2);
        animation: pulse 1.2s infinite alternate;
      }
    `;
    document.head.appendChild(toastStyles);
    
    // Create overlay if it doesn't exist
    if (!document.querySelector('.body_overlay')) {
      const overlay = document.createElement('div');
      overlay.className = 'body_overlay';
      document.body.appendChild(overlay);
    }
    
  } catch (error) {
    console.error("Error initializing toast:", error);
  }
}













// Show toast notification
function showToast(message, isSuccess = true) {
  try {
        
    // If function is called before DOM is ready, just log and return
    if (document.readyState === 'loading') {
      return;
    }
    
    const existingToast = document.querySelector('.advanced-toast');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `advanced-toast ${isSuccess ? 'success' : 'error'}`;
    toast.innerHTML = `
      <div class="toast-icon">${isSuccess ? '✓' : '✗'}</div>
      <div class="toast-message">${message}</div>
      <div class="toast-progress"></div>
    `;

    document.body.appendChild(toast);

    setTimeout(() => toast.classList.add('show'), 10);

    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => toast.remove(), 300);
    }, 3000);
  } catch (error) {
    console.error("Error showing toast:", error);
  }
}











// ======== GAME INITIALIZATION ========

// Initialize the game
function initializeGame() {
  try {
    
        
    // Make sure DOM is ready
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', initializeGameAfterDOM);
      return;
    }
    
    initializeGameAfterDOM();
  } catch (error) {
    console.error("Error initializing game:", error);
  }
}




// Initialize game after DOM is loaded

function initializeGameAfterDOM() {
  try {
        
    // Initialize toast system
    initializeToast();
    
    // Get server time offset for accurate synchronization
    syncServerTime();
    
    // Initialize the timer globally
    syncGlobalTimer();
    
    // Set up global period listener first
    setupGlobalPeriodListener();
    
    // Get or create initial period for the game (forceIncrement = false)
    getOrCreateGamePeriod(false).then(period => {
      currentGamePeriod = period;
      updateGameIdDisplay();
      
      // Set up Firebase listeners
      setupGameResultListener();
      setupBetsListener();
      
      // Check for existing results
      checkCurrentResults();
      
      // Load game history
      updateGameHistoryDisplay();
      
          });
    
    // Set up auth listener
    onAuthStateChanged(auth, handleAuthStateChange);
    
    // Initialize UI
    initializeMultiplier();
    setupEventListeners();
    
    // Start synced timer 
    startSyncedTimer();
    
    // Setup history management
    setupHistoryTabs();
    setupHistoryPagination();
    createUserHistoryContainer();
    
    // Expose global functions to window for HTML attributes
    window.setupBetOnElement = setupBetOnElement;
    window.setOnBetElement = setOnBetElement;
    window.placeBet = placeBet;
    window.generateGameResult = generateGameResult;
    window.start_overlay = start_overlay;
    window.refreshBalance = refreshBalance;
    window.showWinLossResult = showWinLossResult;
    window.nextHistoryPage = nextHistoryPage;
    window.prevHistoryPage = prevHistoryPage;
    window.switchHistoryTab = switchHistoryTab;
    
  } catch (error) {
    console.error("Error in initializeGameAfterDOM:", error);
  }
}













// Create user history container
function createUserHistoryContainer() {
  try {
    const historyContainer = document.querySelector('.gh-table');
    if (!historyContainer) return;
    
    // Check if container already exists
    const existingContainer = document.querySelector('.user-history-container');
    if (existingContainer) return;
    
    // Create a new container for user history
    const userHistoryContainer = document.createElement('div');
    userHistoryContainer.className = 'user-history-container';
    userHistoryContainer.id = 'userHistoryContainer';
    userHistoryContainer.style.display = 'none';  // Initially hidden
    
    // Insert after the history table
    historyContainer.parentNode.insertBefore(userHistoryContainer, historyContainer.nextSibling);
    
    
      } catch (error) {
    console.error("Error creating user history container:", error);
  }
}

// ======== TIMER FUNCTIONS ========

// Sync with server time
function syncServerTime() {
  try {
    const timeRef = ref(db, '.info/serverTimeOffset');
    onValue(timeRef, (snapshot) => {
      if (snapshot.exists()) {
        serverTimeOffset = snapshot.val() || 0;
        
              } else {

      }
    });
  } catch (error) {
    console.error("Error syncing server time:", error);
  }
}

// Get current server time
function getServerTime() {
  return Date.now() + serverTimeOffset;
}

// Sync timer with global timer from Firebase (Global Period System)
function syncGlobalTimer() {
  try {
    // Listen to global game state for synchronized timer
    const globalTimerRef = ref(db, 'globalGameTimer');
    onValue(globalTimerRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = snapshot.val();
        cycleStartTime = data.cycleStartTime;
        
        // Update timer display immediately
        updateTimerFromCycleStart();
      } else {
        // Initialize global timer if doesn't exist
        initializeGlobalTimer();
      }
    });
    
  } catch (error) {
    console.error("Error syncing global timer:", error);
    
    // Fallback to initialize global timer
    initializeGlobalTimer();
  }
}

// Initialize global timer for all users
async function initializeGlobalTimer() {
  try {
    const now = getServerTime();
    const globalTimerRef = ref(db, 'globalGameTimer');
    
    // Check if already exists
    const snapshot = await get(globalTimerRef);
    if (!snapshot.exists()) {
      // Create global timer aligned to minute boundary
      cycleStartTime = Math.floor(now / CYCLE_DURATION) * CYCLE_DURATION;
      
      await set(globalTimerRef, {
        cycleStartTime: cycleStartTime,
        lastUpdate: now
      });
      
      console.log("Global timer initialized:", new Date(cycleStartTime).toISOString());
    }
  } catch (error) {
    console.error("Error initializing global timer:", error);
  }
}

// Start synced timer
function startSyncedTimer() {
  try {
    // Clear any existing interval
    if (timerInterval) clearInterval(timerInterval);
    
    // Update timer immediately
    updateTimerFromCycleStart();
    
    // Set interval for regular updates
    timerInterval = setInterval(() => {
      updateTimerFromCycleStart();
    }, 1000);
    
    
      } catch (error) {
    console.error("Error starting synced timer:", error);
  }
}

// Secret hook to fetch actual upcoming result


// Store the pre-generated result
let preGeneratedResult = null;

// Function to lookup or generate the result early
function SecretResultLOOKUP() {
  try {
    console.log("🔍 SECRET LOOKUP for period:", currentGamePeriod);
        
    // Check if result already exists in database
    const existingResultRef = ref(db, `Realtime_result_count/${currentGamePeriod}`);
    get(existingResultRef).then(snapshot => {
      if (snapshot.exists()) {
        // Result already exists, just display it
        const existingResult = snapshot.val();
         console.log("%c 🎯 ACTUAL RESULT ALREADY EXISTS 🎯 ", "background: #f00; color: #fff; font-size: 16px; font-weight: bold;");
         console.log({
          period: existingResult.period,
          number: existingResult.winning_number,
          color: existingResult.winning_color,
          bigSmall: existingResult.winning_bigSmall
        });
        return;
      }
      
      // 🚨 HIGH PRIORITY: Check for admin override FIRST
      const adminOverrideRef = ref(db, `adminOverride/${currentGamePeriod}`);
      get(adminOverrideRef).then(adminSnapshot => {
        let winningNumber, winningColor, winningBigSmall;
        
        if (adminSnapshot.exists()) {
          const adminOverride = adminSnapshot.val();
          console.log("%c 🔥 ADMIN OVERRIDE DETECTED IN LOOKUP 🔥 ", "background: #00f; color: #fff; font-size: 16px; font-weight: bold;");
          console.log("Admin override data:", adminOverride);
          
          // Use admin-specified number
          winningNumber = parseInt(adminOverride.number);
          const colorData = numberColors[winningNumber];
          winningColor = colorData.colors.length > 1 ?
            colorData.colors[Math.floor(Math.random() * colorData.colors.length)] :
            colorData.colors[0];
          winningBigSmall = colorData.size;
          
          console.log("%c 🎯 ADMIN RESULT PREVIEW 🎯 ", "background: #0a0; color: #fff; font-size: 16px; font-weight: bold;");
          
        } else {
          // No admin override, generate random
          console.log("No admin override, generating random result");
          winningNumber = Math.floor(Math.random() * 10);
          const colorData = numberColors[winningNumber];
          winningColor = colorData.colors.length > 1 ?
            colorData.colors[Math.floor(Math.random() * colorData.colors.length)] :
            colorData.colors[0];
          winningBigSmall = colorData.size;
        }
        
        // Store the generated result for later use
        preGeneratedResult = {
          period: currentGamePeriod,
          winning_number: winningNumber,
          winning_color: winningColor,
          winning_bigSmall: winningBigSmall,
          timestamp: new Date().toISOString(),
          source: adminSnapshot.exists() ? 'admin_override' : 'random'
        };
        
        console.log("📋 Pre-generated result stored:", preGeneratedResult);
        
        // Add to window object for manual checking
        window.actualResult = {
          period: currentGamePeriod,
          number: winningNumber,
          color: winningColor,
          bigSmall: winningBigSmall,
          source: preGeneratedResult.source
        };
        
      }).catch(error => {
        console.error("Error checking admin override:", error);
      });
      
    }).catch(error => {
      console.error("Error checking existing result:", error);
    });
  } catch (error) {
    console.error("Error in early result generation:", error);
  }
}










// Add a listener for our custom reload event

function updateTimerFromCycleStart() {
  try {
    // वर्तमान सर्वर समय और शेष समय की गणना
    const now = getServerTime();
    const elapsed = (now - cycleStartTime) % CYCLE_DURATION;
    const remaining = Math.ceil((CYCLE_DURATION - elapsed) / 1000);
    
    // टाइमर डिस्प्ले को अपडेट करें
    updateTimerDisplay(remaining);
    
    // SECRET HOOK - 45 सेकंड शेष होने पर रिजल्ट पहले ही जनरेट करें
    if (remaining === SECRET_HOOK) {
      console.log("🔍 SECRET HOOK TRIGGERED - Checking for admin override and pre-generating result");
      SecretResultLOOKUP();
    }
    
    // रिजल्ट जनरेट करने का समय
    if (remaining === RESULT_GENERATION_TIME && !resultGenerated) {
      console.log("⏰ RESULT GENERATION TIME - Generating final result with admin override priority");
      generateGameResult();
      resultGenerated = true;
    }
    
    // काउंटडाउन शुरू करें जब 5 सेकंड शेष हों
    if (remaining === 5) {
      
            startResultCountdown();
    }
    
    // रिजल्ट दिखाने का समय
    if (remaining === RESULT_DISPLAY_TIME && !resultsProcessed) {
      
            showResults();
      resultsProcessed = true;
    }
    
    // पीरियड इनक्रीमेंट जब टाइमर 0 पर पहुंचे
    if (remaining <= 0) {
      
            
      // अगली साइकिल के लिए प्रारंभ समय को अपडेट करें
      cycleStartTime = Math.floor(now / CYCLE_DURATION) * CYCLE_DURATION + CYCLE_DURATION;
      localStorage.setItem('winGoStartTime', cycleStartTime.toString());
      
      // पीरियड इनक्रीमेंट करें बिना पेज रीलोड के (forceIncrement = true)
      getOrCreateGamePeriod(true).then(nextPeriod => {
        
                
        // अपडेट करें currentGamePeriod वैरिएबल
        currentGamePeriod = nextPeriod;
        
        // UI अपडेट करें
        updateGameIdDisplay();
        
        // गेम हिस्ट्री अपडेट करें
        updateGameHistoryDisplay();
        
        // फ्लैग्स रीसेट करें
        resultGenerated = false;
        resultsProcessed = false;
        userPlacedBets = false;
        
        
          }).catch(error => {
        console.error("Error updating period:", error);
      });
    }
  } catch (error) {
    console.error("Error updating timer:", error);
  }
}













// Update the timer display
function updateTimerDisplay(seconds) {
  try {
    const timeDigits = document.querySelectorAll('.time-boxes .time-digit');
    if (!timeDigits || timeDigits.length < 5) {
      console.warn("Timer digits elements not found or insufficient");
      return;
    }
    
    // Ensure seconds is within 0-60
    seconds = Math.max(0, Math.min(60, seconds));
    
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    // Update digits: 0 0 : 0 0
    timeDigits[0].textContent = '0';
    timeDigits[1].textContent = minutes;
    timeDigits[2].textContent = ':';
    timeDigits[3].textContent = Math.floor(remainingSeconds / 10);
    timeDigits[4].textContent = remainingSeconds % 10;
  } catch (error) {
    console.error("Error updating timer display:", error);
  }
}

// Start the countdown animation at the end of the cycle
function startResultCountdown() {
  try {
    
        
    const countdownContainer = document.querySelector('.card_container_main');
    const countdownDigits = document.querySelectorAll('.card_dice');
    
    if (!countdownContainer || countdownDigits.length < 2) {
      console.warn("Countdown elements not found");
      return;
    }
    
    let count = 5;
    
    // Show countdown container
    countdownContainer.style.display = 'flex';
    
    // Set initial values
    countdownDigits[0].textContent = '0';
    countdownDigits[1].textContent = '5';
    
    // Clear any existing interval
    if (countdownInterval) clearInterval(countdownInterval);
    
    // Start countdown
    countdownInterval = setInterval(() => {
      count--;
      
      if (count >= 0) {
        countdownDigits[0].textContent = Math.floor(count / 10);
        countdownDigits[1].textContent = count % 10;
      } else {
        clearInterval(countdownInterval);
        countdownContainer.style.display = 'none';
        
        // Get new period when countdown reaches 0 (forceIncrement = true)
        getOrCreateGamePeriod(true).then(period => {
          // Update current period variable
          currentGamePeriod = period;
          
          // Update UI with new period
          updateGameIdDisplay();
          
          // Update game history display
          updateGameHistoryDisplay();
          
          // Reset flags for next cycle
          resultsProcessed = false;
          resultGenerated = false;
          userPlacedBets = false;
          
          
                 
          // Process results if they exist
          if (gameResults && gameResults[currentGamePeriod]) {
            processUserResultsForPeriod(currentGamePeriod, gameResults[currentGamePeriod]);
          }
        }).catch(error => {
          console.error("Error updating period:", error);
        });
      }
    }, 1000);
  } catch (error) {
    console.error("Error starting result countdown:", error);
  }
}








// Get or create GLOBAL game period - All users get same period
async function getOrCreateGamePeriod(forceIncrement = false) {
  try {
    // Use global period node for all users synchronization
    const globalPeriodRef = ref(db, 'globalGameState/currentPeriod');
    const snapshot = await get(globalPeriodRef);
    
    if (snapshot.exists()) {
      const currentPeriod = parseInt(snapshot.val());
      
      // Only increment if forceIncrement is true (timer reached 0)
      if (forceIncrement) {
        const nextPeriod = currentPeriod + 1;
        
        // Update global period for all users
        await set(globalPeriodRef, nextPeriod);
        
        // Also update the global timer cycle
        await updateGlobalTimerCycle();
        
        console.log(`Global period incremented from ${currentPeriod} to ${nextPeriod}`);
        return nextPeriod;
      } else {
        // Just return current global period
        console.log(`Returning current global period: ${currentPeriod}`);
        return currentPeriod;
      }
    } else {
      // Initialize global period if doesn't exist
      const initialPeriod = currentGamePeriod || 2025050645001;
      await set(globalPeriodRef, initialPeriod);
      console.log(`Global period initialized: ${initialPeriod}`);
      return initialPeriod;
    }
  } catch (error) {
    console.error("Error getting/creating global game period:", error);
    
    // Fallback to current period
    if (forceIncrement && currentGamePeriod) {
      const fallbackPeriod = currentGamePeriod + 1;
      console.warn(`Using fallback incremented period: ${fallbackPeriod}`);
      return fallbackPeriod;
    } else {
      console.warn(`Using current period: ${currentGamePeriod}`);
      return currentGamePeriod || 2025050645001;
    }
  }
}

// Update global timer cycle when period increments
async function updateGlobalTimerCycle() {
  try {
    const now = getServerTime();
    const newCycleStartTime = Math.floor(now / CYCLE_DURATION) * CYCLE_DURATION;
    
    const globalTimerRef = ref(db, 'globalGameTimer');
    await set(globalTimerRef, {
      cycleStartTime: newCycleStartTime,
      lastUpdate: now
    });
    
    console.log("Global timer cycle updated for new period");
  } catch (error) {
    console.error("Error updating global timer cycle:", error);
  }
}









// Setup global period listener for real-time synchronization
function setupGlobalPeriodListener() {
  try {
    const globalPeriodRef = ref(db, 'globalGameState/currentPeriod');
    onValue(globalPeriodRef, (snapshot) => {
      if (snapshot.exists()) {
        const globalPeriod = parseInt(snapshot.val());
        
        // Update local period if different from global
        if (globalPeriod !== currentGamePeriod) {
          console.log(`Global period changed: ${currentGamePeriod} -> ${globalPeriod}`);
          currentGamePeriod = globalPeriod;
          
          // Update UI immediately
          updateGameIdDisplay();
          
          // Reset game state for new period
          resultGenerated = false;
          resultsProcessed = false;
          userPlacedBets = false;
          
          // Update history display
          updateGameHistoryDisplay();
          
          // Refresh bets listener for new period
          setupBetsListener();
        }
      }
    });
    
    console.log("Global period listener set up successfully");
  } catch (error) {
    console.error("Error setting up global period listener:", error);
  }
}

// Update game ID display
function updateGameIdDisplay() {
  try {
    const gameIdDisplay = document.querySelector('.game-id');
    if (gameIdDisplay) {
      gameIdDisplay.textContent = currentGamePeriod;
    }
  } catch (error) {
    console.error("Error updating game ID:", error);
  }
}

// ======== BETTING UI FUNCTIONS ========

// Initialize multiplier
function initializeMultiplier() {
  try {
    multiplier = 1;
    
    // Regular multiplier buttons
    const multiplierButtons = document.querySelectorAll('.bet-mult-btn');
    if (multiplierButtons && multiplierButtons.length > 0) {
      multiplierButtons.forEach(btn => {
        btn.classList.remove('selected');
        
        // Extract the multiplier value from data-value attribute
        const value = parseInt(btn.getAttribute('data-value') || '1');
        if (value === 1) {
          btn.classList.add('selected');
        }
      });
    }
    
    // Wingo30 multiplier buttons
    const wingo30MultiplierButtons = document.querySelectorAll('.multiplier_wingo30');
    if (wingo30MultiplierButtons && wingo30MultiplierButtons.length > 0) {
      wingo30MultiplierButtons.forEach(btn => {
        const value = parseInt(btn.textContent.replace('X', ''));
        if (value === 1) {
          btn.classList.add('active');
          btn.classList.remove('inactive');
        } else {
          btn.classList.remove('active');
          btn.classList.add('inactive');
        }
      });
    }
    
    
      } catch (error) {
    console.error("Error initializing multiplier:", error);
  }
}

// Toggle overlay
function start_overlay(show) {
  try {
    const overlay = document.querySelector('.body_overlay');
    if (overlay) {
      if (show) {
        overlay.classList.add('active');
        overlay.style.display = 'block';
      } else {
        overlay.classList.remove('active');
        overlay.style.display = 'none';
      }
    }
  } catch (error) {
    console.error("Error toggling overlay:", error);
  }
}

// Apply random light background to elements
function applyRandomLightBackground() {
  try {
    const header = document.getElementById('betHeader');
    const confirmBtn = document.getElementById('betConfirmBtn');
    const arrow = document.getElementById('betArrow');
    
    if (!header || !confirmBtn || !arrow) return;
    
    const randomColor = lightColors[Math.floor(Math.random() * lightColors.length)];
    
    [header, confirmBtn].forEach(el => {
      el.style.backgroundColor = randomColor;
      el.style.backgroundImage = 'none';
    });
    
    arrow.style.borderTopColor = randomColor;

    const rgb = parseInt(randomColor.substring(1), 16);
    const r = (rgb >> 16) & 0xff;
    const g = (rgb >> 8) & 0xff;
    const b = (rgb >> 0) & 0xff;
    const brightness = (r * 299 + g * 587 + b * 114) / 1000;
    const textColor = brightness > 125 ? '#000' : '#fff';
    
    [header, confirmBtn].forEach(el => {
      el.style.color = textColor;
    });
  } catch (error) {
    console.error("Error applying random background:", error);
  }
}

// Apply element background based on selected item
function applyElementBackground(element) {
  try {
    if (!(element instanceof Element)) return;
    
    const header = document.getElementById('betHeader');
    const confirmBtn = document.getElementById('betConfirmBtn');
    const arrow = document.getElementById('betArrow');
    const selectionPreview = document.getElementById('betSelectionPreview');
    
    if (!header || !confirmBtn || !arrow) return;
    
    let bgColor = '';
    
    // Set the preview text to match the selected element
    if (selectionPreview) {
      selectionPreview.textContent = element.textContent.trim();
    }
    
    if (element.classList.contains('red_wingo30') || element.classList.contains('color-option_wingo30') && element.style.background.includes('f87171')) {
      bgColor = '#FF4444';
    } else if (element.classList.contains('green_wingo30') || element.classList.contains('color-option_wingo30') && element.style.background.includes('22c55e')) {
      bgColor = '#01C136';
    } else if (element.classList.contains('violet_wingo30') || element.classList.contains('color-option_wingo30') && element.style.background.includes('c084fc')) {
      bgColor = '#9C3EBB';
    } else if (element.classList.contains('ball_wingo30')) {
      // For number balls, use a bright color
      bgColor = '#3498db';
    } else if (element.classList.contains('big-option_wingo30')) {
      bgColor = '#E67E22';
    } else if (element.classList.contains('small-option_wingo30')) {
      bgColor = '#9B59B6';
    } else {
      // Apply random background if it's not a recognized element
      applyRandomLightBackground();
      return;
    }
    
    [header, confirmBtn].forEach(el => {
      el.style.backgroundColor = bgColor;
      el.style.backgroundImage = 'none';
    });
    
    arrow.style.borderTopColor = bgColor;
    
    [header, confirmBtn].forEach(el => {
      el.style.color = '#fff';
    });
  } catch (error) {
    console.error("Error applying element background:", error);
  }
}

// Show random selection animation
function showRandomSelectionAnimation() {
  try {
    const mainBtn = document.getElementById('betMainBtn');
    const selectionPreview = document.getElementById('betSelectionPreview');
    const selectorContainer = document.getElementById('betSelectorContainer');
    
    if (!mainBtn || !selectionPreview || !selectorContainer) return;
    
    const numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
    let counter = 0;
    const animationDuration = 2000;
    const interval = 100;

    const animationInterval = setInterval(() => {
      const randomIndex = Math.floor(Math.random() * numbers.length);
      mainBtn.textContent = numbers[randomIndex];
      selectionPreview.textContent = numbers[randomIndex];
      counter += interval;

      if (counter >= animationDuration) {
        clearInterval(animationInterval);
        const finalNumber = numbers[Math.floor(Math.random() * numbers.length)];
        mainBtn.textContent = finalNumber;
        selectionPreview.textContent = finalNumber;
        selectionPreview.style.fontSize = '5vmin';

        selectorContainer.classList.add('visible');
        selectorContainer.style.display = 'block';
        start_overlay(true);
        updateTotal();
        applyRandomLightBackground();
      }
    }, interval);
  } catch (error) {
    console.error("Error in random selection animation:", error);
  }
}

// Update total bet amount display
function updateTotal() {
  try {
    const confirmBtn = document.getElementById('betConfirmBtn');
    if (!confirmBtn) return;
    
    const total = balanceValue * quantity * multiplier;
    confirmBtn.textContent = `Place Bet ₹${formatIndianNumber(total.toFixed(2))}`;
  } catch (error) {
    console.error("Error updating total:", error);
  }
}

// Set up bet on element - IMPROVED
function setupBetOnElement(element) {
  try {
    if (!element || !(element instanceof Element)) {
      console.warn("setupBetOnElement called with invalid element");
      return;
    }
    
    const mainBtn = document.getElementById('betMainBtn');
    const selectionPreview = document.getElementById('betSelectionPreview');
    const selectorContainer = document.getElementById('betSelectorContainer');
    
    if (!mainBtn || !selectionPreview || !selectorContainer) return;

    const isMultiplier = element.classList.contains('multiplier_wingo30');
    const isRandomBtn = element.classList.contains('random-btn_wingo30');
    const isColor = element.classList.contains('color-option_wingo30');
    const isBigSmall = element.classList.contains('big-option_wingo30') || 
                      element.classList.contains('small-option_wingo30');

    if (isMultiplier) {
      const text = element.textContent.trim().toUpperCase();
      const value = parseInt(text.replace('X', ''));
      if (!isNaN(value)) {
        multiplier = value;
        document.querySelectorAll('.multiplier_wingo30').forEach(el => {
          el.classList.toggle('active', el === element);
          el.classList.toggle('inactive', el !== element);
        });
        updateTotal();
        showToast(`Multiplier set to ${text}`);
      }
      return;
    }

    if (isRandomBtn) {
      showToast("Selecting random number...");
      showRandomSelectionAnimation();
      betType = 'number';
      return;
    }

    const text = (element.textContent || '').trim();
    if (mainBtn) mainBtn.textContent = text;
    if (selectionPreview) {
      selectionPreview.textContent = text;
      selectionPreview.style.fontSize = "5vmin";
    }

    applyElementBackground(element);

    selectedElement = element;
    if (selectorContainer) {
      selectorContainer.classList.add('visible');
      selectorContainer.style.display = 'block'; // Ensure it's visible
    }
    start_overlay(true);
    updateTotal();

    // Determine bet type
    if (element.classList.contains('ball_wingo30')) {
      betType = 'number';
    } else if (isColor) {
      betType = 'color';
    } else if (isBigSmall) {
      betType = 'bigSmall';
    }
  } catch (error) {
    console.error("Error in setupBetOnElement:", error);
  }
}

// Set on bet element - IMPROVED
function setOnBetElement() {
  try {
    // Number buttons
    const numberButtons = document.querySelectorAll('.number-grid .number-item, .ball_wingo30');
    if (numberButtons && numberButtons.length > 0) {
      
            numberButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          setupBetOnElement(btn);
          betType = 'number';
        });
      });
    }
    
    // Color buttons
    const colorButtons = document.querySelectorAll('.color-select-grid .color-item, .color-option_wingo30');
    if (colorButtons && colorButtons.length > 0) {
      
            colorButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          setupBetOnElement(btn);
          betType = 'color';
        });
      });
    }
    
    // Big/Small buttons
    const bigSmallButtons = document.querySelectorAll('.size-select-grid .size-item, .big-option_wingo30, .small-option_wingo30');
    if (bigSmallButtons && bigSmallButtons.length > 0) {
      
            bigSmallButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          setupBetOnElement(btn);
          betType = 'bigSmall';
        });
      });
    }
    
    // Random button
    const randomBtn = document.querySelector('.random-btn_wingo30');
    if (randomBtn) {
      randomBtn.addEventListener('click', () => {
        showRandomSelectionAnimation();
        betType = 'number';
      });
    }
    
    // Multiplier buttons
    const multiplierButtons = document.querySelectorAll('.multiplier_wingo30');
    if (multiplierButtons && multiplierButtons.length > 0) {
      multiplierButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          const text = btn.textContent.trim().toUpperCase();
          const value = parseInt(text.replace('X', ''));
          
          if (!isNaN(value)) {
            // Update multiplier value
            multiplier = value;
            
            // Update UI for all multiplier buttons
            multiplierButtons.forEach(el => {
              el.classList.toggle('active', el === btn);
              el.classList.toggle('inactive', el !== btn);
            });
            
            // Update bet total
            updateTotal();
            
            // Show confirmation toast
            showToast(`Multiplier set to ${text}`);
          }
        });
      });
    }
    
    
      } catch (error) {
    console.error("Error setting bet elements:", error);
  }
}

// Setup event listeners
function setupEventListeners() {
  try {
    // Balance buttons
    const balanceButtons = document.querySelectorAll('.bet-opt-btn');
    if (balanceButtons) {
      balanceButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          balanceButtons.forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          balanceValue = parseFloat(btn.getAttribute('data-value') || '1');
          
                    updateTotal();
        });
      });
      
      // Set default balance button
      if (balanceButtons[0]) {
        balanceButtons[0].classList.add('selected');
        balanceValue = parseFloat(balanceButtons[0].getAttribute('data-value') || '1');
      }
    }
    
    // Quantity buttons
    const minusBtn = document.querySelector('.minus');
    const plusBtn = document.querySelector('.plus');
    const quantityDisplay = document.querySelector('.bet-qty-display');
    
    if (minusBtn && plusBtn && quantityDisplay) {
      minusBtn.addEventListener('click', () => {
        if (quantity > 1) {
          quantity--;
          quantityDisplay.textContent = quantity;
          updateTotal();
        }
      });
      
      plusBtn.addEventListener('click', () => {
        quantity++;
        quantityDisplay.textContent = quantity;
        updateTotal();
      });
    }
    
    // Multiplier buttons in bet popup
    const multiplierButtons = document.querySelectorAll('.bet-mult-btn');
    if (multiplierButtons) {
      multiplierButtons.forEach(btn => {
        btn.addEventListener('click', () => {
          multiplierButtons.forEach(b => b.classList.remove('selected'));
          btn.classList.add('selected');
          // Get the multiplier value from data-value attribute
          multiplier = parseFloat(btn.getAttribute('data-value') || '1');
          
                    updateTotal();
        });
      });
    }
    
    // Agreement checkbox
    const agreementCheckbox = document.getElementById('betCheckbox');
    if (agreementCheckbox) {
      agreementCheckbox.addEventListener('click', () => {
        // Toggle the agreement state
        agreed = !agreed;
        
        // Update the visual state of the checkbox
        const checkmark = agreementCheckbox.querySelector('.bet-checkmark');
        if (checkmark) {
          checkmark.style.display = agreed ? 'block' : 'none';
        }
      });
      
      // Default to checked
      agreed = true;
      const checkmark = agreementCheckbox.querySelector('.bet-checkmark');
      if (checkmark) {
        checkmark.style.display = 'block';
      }
    }
    
    // Confirm button
    const confirmBtn = document.getElementById('betConfirmBtn');
    if (confirmBtn) {
      confirmBtn.addEventListener('click', placeBet);
    }
    
    // Cancel button
    const cancelBtn = document.getElementById('betCancelBtn');
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => {
        // Close selector
        const selectorContainer = document.getElementById('betSelectorContainer');
        if (selectorContainer) {
          selectorContainer.classList.remove('visible');
          selectorContainer.style.display = 'none';
        }
        start_overlay(false);
      });
    }
    
    // Toggle button for bet selector
    const toggleBtn = document.getElementById('betToggleBtn');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', () => {
        const selectorContainer = document.getElementById('betSelectorContainer');
        if (selectorContainer) {
          const isVisible = selectorContainer.classList.contains('visible');
          if (isVisible) {
            selectorContainer.classList.remove('visible');
            selectorContainer.style.display = 'none';
            start_overlay(false);
          } else {
            selectorContainer.classList.add('visible');
            selectorContainer.style.display = 'block';
            start_overlay(true);
          }
        }
      });
    }
    
    // Result close buttons
    const closeButtons = document.querySelectorAll('.OverlayLayouts .textStylingOnlyClosebtn, .OverlayLayouts_LOSE .textStylingOnlyClosebtn_LOSE');
    closeButtons.forEach(btn => {
      btn.addEventListener('click', () => {
        const overlay = btn.closest('.OverlayLayouts') || btn.closest('.OverlayLayouts_LOSE');
        if (overlay) {
          overlay.style.display = 'none';
        }
      });
    });
    
    // Set up bet element handlers
    setOnBetElement();
  } catch (error) {
    console.error("Error setting up event listeners:", error);
  }
}

// Open bet selector with selected value
function openBetSelector(type, value) {
  try {
    
        
    betType = type;
    
    const selectorContainer = document.getElementById('betSelectorContainer');
    const header = document.getElementById('betHeader');
    const selectionPreview = document.getElementById('betSelectionPreview');
    const mainBtn = document.getElementById('betMainBtn');
    
    if (!selectorContainer || !header || !selectionPreview || !mainBtn) {
      console.warn("Bet selector elements not found");
      return;
    }
    
    let title = '';
    
    switch (type) {
      case 'number':
        title = 'Number';
        break;
      case 'color':
        title = 'Color';
        break;
      case 'bigSmall':
        title = 'Size';
        break;
      default:
        console.warn("Invalid bet type");
        return;
    }
    
    // Update UI
    header.textContent = `Select ${title}`;
    selectionPreview.textContent = value;
    mainBtn.textContent = value;
    
    // Show selector
    selectorContainer.classList.add('visible');
    selectorContainer.style.display = 'block';
    start_overlay(true);
    
    // Update total
    updateTotal();
    
    // Apply background
    applyRandomLightBackground();
  } catch (error) {
    console.error("Error opening bet selector:", error);
  }
}

// ======== BETTING LOGIC FUNCTIONS ========

// Handle authentication state changes
function handleAuthStateChange(user) {
  try {
    if (user) {
      currentUser = user;

      loadUserBalance();
      // Check if user has placed bets in this period
      checkUserBets();
      // Load user history
      loadUserBettingHistory();
    } else {
      currentUser = null;
      showToast("Please login to place bets", false);
    }
  } catch (error) {
    console.error("Error handling auth state:", error);
  }
}

// Check if user has placed bets in current period
async function checkUserBets() {
  try {
    if (!currentUser) return;
    
    const userBetsRef = ref(db, `CurrentGameBets/${currentGamePeriod}/${currentUser.uid}`);
    const snapshot = await get(userBetsRef);
    
    if (snapshot.exists()) {
      userPlacedBets = true;
      
          } else {
      userPlacedBets = false;
      
        }
  } catch (error) {
    console.error("Error checking user bets:", error);
  }
}

// Load user balance
async function loadUserBalance() {
  try {
    if (!currentUser) return;
    
    const balanceRef = ref(db, `RoyalWinUserDataBase/${currentUser.uid}/balance`);
    const snapshot = await get(balanceRef);
    
    if (snapshot.exists()) {
      userBalance = parseFloat(snapshot.val()) || 0;
      updateBalanceDisplay(userBalance);
    } else {
      
            // Create initial balance if it doesn't exist
      await set(balanceRef, 1000);
      userBalance = 1000;
      updateBalanceDisplay(userBalance);
    }
  } catch (error) {
    console.error("Error loading balance:", error);
    showToast("Error loading balance", false);
  }
}

// Update balance display with Indian formatting
function updateBalanceDisplay(balance) {
  try {
    const balanceDisplay = document.getElementById('balanceDisplay');
    if (balanceDisplay) {
      // Use Indian number format
      balanceDisplay.textContent = `₹${formatIndianNumber(balance.toFixed(2))}`;
    }
  } catch (error) {
    console.error("Error updating balance display:", error);
  }
}

// Place a bet
async function placeBet() {
  try {
    if (!currentUser) {
      showToast("Please login to place bets", false);
      return;
    }
    
    const total = balanceValue * quantity * multiplier;
    
    if (total > userBalance) {
      showToast("Insufficient balance", false);
      return;
    }
    
    if (total > MAX_BET) {
      showToast(`Maximum bet amount is ₹${formatIndianNumber(MAX_BET)}`, false);
      return;
    }
    
    if (!agreed) {
      showToast("Please agree to the terms", false);
      return;
    }
    
    // Get selected value based on bet type
    const mainBtn = document.getElementById('betMainBtn');
    if (!mainBtn) {
      showToast("Selection error", false);
      return;
    }
    
    const selectedValue = mainBtn.textContent.trim();
    if (!selectedValue) {
      showToast("Please select a value", false);
      return;
    }
    
    // Get remaining time in current round
    const now = getServerTime();
    const elapsed = (now - cycleStartTime) % CYCLE_DURATION;
    const remaining = Math.ceil((CYCLE_DURATION - elapsed) / 1000);
    
    // Don't allow bets in last 5 seconds
    if (remaining <= 5) {
      showToast("Betting closed for this round", false);
      return;
    }
    
    
        
    // Create bet object
    const bet = {
      bet_type: betType,
      user_selected_value: selectedValue,
      user_total_amount: total,
      user_multiplier: multiplier,
      bet_status: 'pending',
      timestamp: new Date().toISOString()
    };
    
    // Add type-specific fields
    if (betType === 'number') {
      bet.user_selected_numbers = selectedValue;
    } 
    else if (betType === 'color') {
      bet.user_selected_color = selectedValue.toLowerCase();
    } 
    else if (betType === 'bigSmall') {
      bet.user_selected_bigSmall = selectedValue.toLowerCase();
    } else {
      showToast("Invalid bet type", false);
      return;
    }
    
    // Save bet to database
    const newBetRef = push(ref(db, `CurrentGameBets/${currentGamePeriod}/${currentUser.uid}`));
    await set(newBetRef, bet);
    
    // Update user balance
    userBalance -= total;
    await set(ref(db, `RoyalWinUserDataBase/${currentUser.uid}/balance`), userBalance);
    updateBalanceDisplay(userBalance);
    
    // Close selector
    const selectorContainer = document.getElementById('betSelectorContainer');
    if (selectorContainer) {
      selectorContainer.classList.remove('visible');
      selectorContainer.style.display = 'none';
    }
    start_overlay(false);
    
    userPlacedBets = true;
    showToast("Bet placed successfully!");
    
    
        
    // Update user betting history if needed
    if (currentHistoryTab === 'user') {
      loadUserBettingHistory();
    }
  } catch (error) {
    console.error("Error placing bet:", error);
    showToast("Error placing bet", false);
  }
}

// Setup listener for game results
function setupGameResultListener() {
  try {
    const resultsRef = ref(db, 'Realtime_result_count');
    onValue(resultsRef, (snapshot) => {
      if (snapshot.exists()) {
        gameResults = snapshot.val() || {};
        
        // Check if result exists for current period
        if (gameResults[currentGamePeriod] && currentUser && userPlacedBets && !resultsProcessed) {

          // Show result to current user
          const result = gameResults[currentGamePeriod];
          processUserResultsForPeriod(currentGamePeriod, result);
          resultsProcessed = true;
        }
      }
    }, (error) => {
      console.error("Error setting up game result listener:", error);
    });
  } catch (error) {
    console.error("Error setting up game result listener:", error);
  }
}

// Setup listener for all bets in current game
function setupBetsListener() {
  try {
    if (!currentGamePeriod) {
            return;
    }
    
    const betsRef = ref(db, `CurrentGameBets/${currentGamePeriod}`);
    onValue(betsRef, (snapshot) => {
      if (snapshot.exists()) {
        allBets = snapshot.val() || {};
        calculateBetStatistics();
        
        // Check if current user has bets
        if (currentUser && allBets[currentUser.uid]) {
          userPlacedBets = true;
          
                 }
      } else {

        // Reset bet statistics if no bets
        betStatistics = {
          numbers: {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0},
          colors: {red:0, green:0, violet:0},
          bigSmall: {big:0, small:0}
        };
      }
    }, (error) => {
      console.error("Error setting up bets listener:", error);
    });
  } catch (error) {
    console.error("Error setting up bets listener:", error);
  }
}

// Calculate bet statistics
function calculateBetStatistics() {
  try {
    betStatistics = {
      numbers: {0:0, 1:0, 2:0, 3:0, 4:0, 5:0, 6:0, 7:0, 8:0, 9:0},
      colors: {red:0, green:0, violet:0},
      bigSmall: {big:0, small:0}
    };
    
    for (const userId in allBets) {
      const userBets = allBets[userId];
      for (const betId in userBets) {
        const bet = userBets[betId];
        
        if (bet.bet_type === 'number') {
          const number = parseInt(bet.user_selected_numbers);
          if (!isNaN(number) && number >= 0 && number <= 9) {
            betStatistics.numbers[number] += bet.user_total_amount;
          }
        } 
        else if (bet.bet_type === 'color') {
          const color = bet.user_selected_color.toLowerCase();
          if (color in betStatistics.colors) {
            betStatistics.colors[color] += bet.user_total_amount;
          }
        } 
        else if (bet.bet_type === 'bigSmall') {
          const type = bet.user_selected_bigSmall.toLowerCase();
          if (type in betStatistics.bigSmall) {
            betStatistics.bigSmall[type] += bet.user_total_amount;
          }
        }
      }
    }
  } catch (error) {
    console.error("Error calculating bet statistics:", error);
  }
}

// Check for current results
async function checkCurrentResults() {
  try {
    if (!currentGamePeriod) {
      
            return;
    }
    
    const resultsRef = ref(db, `Realtime_result_count/${currentGamePeriod}`);
    const snapshot = await get(resultsRef);
    
    if (snapshot.exists() && currentUser) {
      // Check if user placed bets in this period
      const userBetsRef = ref(db, `CurrentGameBets/${currentGamePeriod}/${currentUser.uid}`);
      try {
        const betsSnapshot = await get(userBetsRef);
        
        if (betsSnapshot.exists()) {
          // User placed bets in this period, process results
          const resultData = snapshot.val();
          processUserResultsForPeriod(currentGamePeriod, resultData);
        }
      } catch (error) {
        console.error("Error checking user bets:", error);
      }
    } else {
      
          }
  } catch (error) {
    console.error("Error checking current results:", error);
  }
}

// Process results for a specific period for the current user

async function processUserResultsForPeriod(period, resultData) {
  try {
    if (!currentUser) return;
    
    
        
    const userBetsRef = ref(db, `CurrentGameBets/${period}/${currentUser.uid}`);
    try {
      const snapshot = await get(userBetsRef);
      
      if (!snapshot.exists()) {
        
                return;
      }
      
      const userBets = snapshot.val();
      const userResults = [];
      let totalWinnings = 0;
      
      // Transform bets for result display
      for (const betId in userBets) {
        const bet = userBets[betId];
        let isWin = false;
        let winAmount = 0;
        
        // Check if bet is a winner
        if (bet.bet_type === 'number' && parseInt(bet.user_selected_numbers) === resultData.winning_number) {
          isWin = true;
          winAmount = bet.user_total_amount * NUMBER_WIN_MULTIPLIER;
        }
        else if (bet.bet_type === 'color' && bet.user_selected_color.toLowerCase() === resultData.winning_color.toLowerCase()) {
          isWin = true;
          winAmount = bet.user_total_amount * COLOR_WIN_MULTIPLIER;
        }
        else if (bet.bet_type === 'bigSmall' && bet.user_selected_bigSmall.toLowerCase() === resultData.winning_bigSmall.toLowerCase()) {
          isWin = true;
          winAmount = bet.user_total_amount * BIGSMALL_WIN_MULTIPLIER;
        }
        
        // Round to 2 decimal places
        winAmount = Math.round(winAmount * 100) / 100;
        
        // Update bet status in database
        await update(ref(db, `CurrentGameBets/${period}/${currentUser.uid}/${betId}`), {
          bet_status: isWin ? 'win' : 'lose',
          win_amount: winAmount,
          result_number: resultData.winning_number,
          result_color: resultData.winning_color,
          result_bigSmall: resultData.winning_bigSmall
        });
        
        userResults.push({
          bet_type: bet.bet_type,
          selected_value: bet.user_selected_value,
          amount: bet.user_total_amount,
          win_amount: winAmount,
          is_win: isWin
        });
        
        totalWinnings += winAmount;
      }
      
      /* बैलेंस अपडेट लॉजिक को हटा दिया गया है क्योंकि यह 
         पहले ही processBetsForWinners() में किया जाता है */
      
      // बैलेंस डिस्प्ले को रिफ्रेश करें ताकि वॉलेट UI में नवीनतम बैलेंस दिखे
      if (totalWinnings > 0) {
        // Refresh the balance display to show the updated balance
        refreshBalance();
        
              }
      
      // Show the results to user using custom HTML
      showWinLossResult(
        userResults,
        resultData.winning_number,
        resultData.winning_color,
        resultData.winning_bigSmall,
        period,
        totalWinnings
      );
      
      // Update user betting history if needed
      if (currentHistoryTab === 'user') {
        loadUserBettingHistory();
      }
      
      
          } catch (error) {
      console.error("Error processing user results:", error);
    }
  } catch (error) {
    console.error("Error processing user results for period:", error);
  }
}
































// Generate game result
async function generateGameResult() {
  try {
    console.log("🎯 Generating game result for period:", currentGamePeriod);
        
    // Check if result already exists
    const existingResultRef = ref(db, `Realtime_result_count/${currentGamePeriod}`);
    const snapshot = await get(existingResultRef);
    
    if (snapshot.exists()) {
      console.log("Result already exists for period:", currentGamePeriod);
      return;
    }
    
    let result;
    let winningNumber;
    let winningColor;
    let winningBigSmall;
    
    // 🚨 HIGH PRIORITY: Check for admin override FIRST
    try {
      const adminOverrideRef = ref(db, `adminOverride/${currentGamePeriod}`);
      const adminSnapshot = await get(adminOverrideRef);
      
      if (adminSnapshot.exists()) {
        const adminOverride = adminSnapshot.val();
        console.log("🔥 ADMIN OVERRIDE DETECTED:", adminOverride);
        
        // Use admin-specified number
        winningNumber = parseInt(adminOverride.number);
        
        // Get color and size for admin number
        const colorData = numberColors[winningNumber];
        winningColor = colorData.colors.length > 1 ?
          colorData.colors[Math.floor(Math.random() * colorData.colors.length)] :
          colorData.colors[0];
        winningBigSmall = colorData.size;
        
        console.log("🎯 ADMIN RESULT SET:", {
          number: winningNumber,
          color: winningColor,
          size: winningBigSmall
        });
        
        // Remove the override after using it
        await set(adminOverrideRef, null);
        console.log("✅ Admin override used and cleared");
        
      } else {
        // No admin override - use other methods
        
        // Use pre-generated result if available
        if (preGeneratedResult && preGeneratedResult.period === currentGamePeriod) {
          console.log("📋 Using pre-generated result");
          winningNumber = preGeneratedResult.winning_number;
          winningColor = preGeneratedResult.winning_color;
          winningBigSmall = preGeneratedResult.winning_bigSmall;
          // Reset for next period
          preGeneratedResult = null;
        } else {
          // Generate random result
          console.log("🎲 Generating random result");
          
          winningNumber = Math.floor(Math.random() * 10);
          const colorData = numberColors[winningNumber];
          winningColor = colorData.colors.length > 1 ?
            colorData.colors[Math.floor(Math.random() * colorData.colors.length)] :
            colorData.colors[0];
          winningBigSmall = colorData.size;
        }
      }
    } catch (adminError) {
      console.error("Error checking admin override:", adminError);
      
      // Fallback to random generation
      winningNumber = Math.floor(Math.random() * 10);
      const colorData = numberColors[winningNumber];
      winningColor = colorData.colors.length > 1 ?
        colorData.colors[Math.floor(Math.random() * colorData.colors.length)] :
        colorData.colors[0];
      winningBigSmall = colorData.size;
    }
    
    // Create result object
    result = {
      period: currentGamePeriod,
      winning_number: winningNumber,
      winning_color: winningColor,
      winning_bigSmall: winningBigSmall,
      timestamp: new Date().toISOString(),
      source: 'admin_override' // Mark as admin controlled if override was used
    };
    
    console.log("🏆 FINAL RESULT:", result);
    
    // Save result to database
    await set(ref(db, `Realtime_result_count/${currentGamePeriod}`), result);
    console.log("✅ Result saved to database");
    
    // Save to period history database
    await savePeriodToHistory(currentGamePeriod, result.winning_number, result.winning_color, result.winning_bigSmall);
    
    // Process all bets to determine winners
    await processBetsForWinners(result.winning_number, result.winning_color, result.winning_bigSmall);
  } catch (error) {
    console.error("Error generating game result:", error);
  }
}














// Show results at end of cycle
function showResults() {
  try {

    
    // Force show results even if user has no bets
    const resultRef = ref(db, `Realtime_result_count/${currentGamePeriod}`);
    get(resultRef).then((snapshot) => {
      if (snapshot.exists()) {
        const resultData = snapshot.val();
        
        if (currentUser && userPlacedBets) {
          // User has bets, show their results
          processUserResultsForPeriod(currentGamePeriod, resultData);
        } else if (currentUser) {
          // User is logged in but has no bets, still show the result without user-specific data
          showWinLossResult(
            [], // empty user results 
            resultData.winning_number, 
            resultData.winning_color, 
            resultData.winning_bigSmall,
            currentGamePeriod,
            0 // No winnings
          );
        }
        
        // Also update history display
        updateGameHistoryDisplay();
        
        // Update user betting history if needed
        if (currentUser && currentHistoryTab === 'user') {
          loadUserBettingHistory();
        }
        
        resultsProcessed = true;
      } else {

        // If no result found, generate one now (emergency recovery)
        generateGameResult().then(() => {
          // Try again to show results
          setTimeout(() => {
            showResults();
          }, 1000);
        });
      }
    }).catch((error) => {
      console.error("Error fetching result:", error);
    });
  } catch (error) {
    console.error("Error showing results:", error);
  }
}

// Process all bets to determine winners
async function processBetsForWinners(winningNumber, winningColor, winningBigSmall) {
  try {

    
    const betsRef = ref(db, `CurrentGameBets/${currentGamePeriod}`);
    const snapshot = await get(betsRef);
    
    if (!snapshot.exists()) {

      return;
    }
    
    const allBets = snapshot.val();
    
    for (const userId in allBets) {
      const userBets = allBets[userId];
      let userWinnings = 0;
      
      for (const betId in userBets) {
        const bet = userBets[betId];
        let isWin = false;
        let winAmount = 0;
        
        // Check if bet is a winner
        if (bet.bet_type === 'number' && parseInt(bet.user_selected_numbers) === winningNumber) {
          isWin = true;
          winAmount = bet.user_total_amount * NUMBER_WIN_MULTIPLIER;
        }
        else if (bet.bet_type === 'color' && bet.user_selected_color.toLowerCase() === winningColor.toLowerCase()) {
          isWin = true;
          winAmount = bet.user_total_amount * COLOR_WIN_MULTIPLIER;
        }
        else if (bet.bet_type === 'bigSmall' && bet.user_selected_bigSmall.toLowerCase() === winningBigSmall.toLowerCase()) {
          isWin = true;
          winAmount = bet.user_total_amount * BIGSMALL_WIN_MULTIPLIER;
        }
        
        // Round to 2 decimal places
        winAmount = Math.round(winAmount * 100) / 100;
        
        // Update bet status
        await update(ref(db, `CurrentGameBets/${currentGamePeriod}/${userId}/${betId}`), {
          bet_status: isWin ? 'win' : 'lose',
          win_amount: winAmount,
          result_number: winningNumber,
          result_color: winningColor,
          result_bigSmall: winningBigSmall
        });
        
        userWinnings += winAmount;
      }
      
      // Update user balance if they won
      if (userWinnings > 0) {
        const userRef = ref(db, `RoyalWinUserDataBase/${userId}/balance`);
        const balanceSnapshot = await get(userRef);
        
        if (balanceSnapshot.exists()) {
          const currentBalance = parseFloat(balanceSnapshot.val()) || 0;
          const newBalance = currentBalance + userWinnings;
          
          // Update balance in database
          await set(userRef, newBalance);
          

          
          // Update local balance if this is the current user
          if (userId === currentUser?.uid) {
            userBalance = newBalance;
            updateBalanceDisplay(userBalance);
          }
        }
      }
    }
    

  } catch (error) {
    console.error("Error processing bets for winners:", error);
  }
}

// Save period to history with count - IMPROVED for numeric ordering
async function savePeriodToHistory(period, winningNumber, winningColor, winningBigSmall) {
  try {
    // Get current count from database
    const countRef = ref(db, 'PERIOD_COUNT/count');
    
    let currentCount = 1;
    try {
      const countSnapshot = await get(countRef);
      if (countSnapshot.exists()) {
        currentCount = parseInt(countSnapshot.val()) + 1;
      }
    } catch (error) {
      console.error("Error getting current count:", error);
    }
    
    // Create timestamp
    const now = new Date();
    const timestamp = `${now.getFullYear()}/${String(now.getMonth()+1).padStart(2,'0')}/${String(now.getDate()).padStart(2,'0')}/${String(now.getHours()).padStart(2,'0')}/${String(now.getMinutes()).padStart(2,'0')}/${String(now.getSeconds()).padStart(2,'0')}`;
    
    // Create period data
    const periodData = {
      period_count_number: currentCount,
      period_number: period,
      win_color: winningColor,
      win_number: winningNumber,
      win_bigSmall: winningBigSmall,
      date: timestamp
    };
    
    // Save to database
    try {
      // Save to periods record
      await set(ref(db, `PERIOD_COUNT/periods/${period}`), periodData);
      await set(countRef, currentCount);
      
      // Add to history list - using normal set instead of push to ensure period-based sorting
      // This ensures history is stored by period number, which is incrementing
      await set(ref(db, `PERIOD_COUNT/history/${period}`), periodData);
      
      // Save to local storage for persistent history
      saveHistoryToLocalStorage(periodData);

      
      // Update history display immediately
      updateGameHistoryDisplay();
      
      return periodData;
    } catch (error) {
      console.error("Error saving period data:", error);
    }
  } catch (error) {
    console.error("Error saving period to history:", error);
    return null;
  }
}

// Save history item to local storage
function saveHistoryToLocalStorage(periodData) {
  try {
    // Get existing history from localStorage
    const historyString = localStorage.getItem('wingo_game_history');
    let history = [];
    
    if (historyString) {
      try {
        history = JSON.parse(historyString);
        if (!Array.isArray(history)) {
          history = [];
        }
      } catch (e) {
        console.error("Error parsing history from localStorage:", e);
        history = [];
      }
    }
    
    // Add new period data
    history.unshift(periodData); // Add to beginning of array
    
    // Limit to 100 most recent entries
    if (history.length > 100) {
      history = history.slice(0, 100);
    }
    
    // Save back to localStorage
    localStorage.setItem('wingo_game_history', JSON.stringify(history));

  } catch (error) {
    console.error("Error saving history to localStorage:", error);
  }
}

// Show win/loss result using custom HTML elements
function showWinLossResult(userResults, winningNumber, winningColor, winningBigSmall, period, totalWinnings = 0) {
  try {

    
    // Only show result to the current user if they have placed bets
    if (!currentUser || !userPlacedBets) {
      
            return;
    }
    
    // Clear any existing timeout
    if (resultDisplayTimeout) {
      clearTimeout(resultDisplayTimeout);
    }
    
    // Determine if user won or lost
    const hasWin = totalWinnings > 0;
    
    // Select the appropriate container
    const resultContainer = hasWin ? 
      document.querySelector('.OverlayLayouts') : 
      document.querySelector('.OverlayLayouts_LOSE');
    
    if (!resultContainer) {
      console.error("Result container not found");
      return;
    }
    
    // Update period number
    const periodElement = hasWin ? 
      document.getElementById('Peroid_Number') : 
      document.getElementById('Peroid_Number_LOSE');
    
    if (periodElement) {
      periodElement.textContent = `Period 1M Wingo: ${period}`;
    }
    
    // Update amount (only for win)
    if (hasWin) {
      const amountElement = document.getElementById('AMOUNT');
      if (amountElement) {
        amountElement.textContent = `₹${formatIndianNumber(totalWinnings.toFixed(2))}`;
      }
    }
    
    // Update result values (color, number, size)
    // For win results
    if (hasWin) {
      const colorElement = document.getElementById('Color_value');
      const numberElement = document.getElementById('Number_Value');
      const sizeElement = document.getElementById('Size_Value');
      
      if (colorElement) colorElement.textContent = capitalizeFirstLetter(winningColor);
      if (numberElement) numberElement.textContent = winningNumber;
      if (sizeElement) sizeElement.textContent = capitalizeFirstLetter(winningBigSmall);
    } 
    // For lose results
    else {
      const colorElement = document.getElementById('Color_value_LOSE');
      const numberElement = document.getElementById('Number_Value_LOSE');
      const sizeElement = document.getElementById('Size_Value_LOSE');
      
      if (colorElement) colorElement.textContent = capitalizeFirstLetter(winningColor);
      if (numberElement) numberElement.textContent = winningNumber;
      if (sizeElement) sizeElement.textContent = capitalizeFirstLetter(winningBigSmall);
    }
    
    // Show the container
    resultContainer.style.display = 'flex';
    
    // Auto-close after timeout (5 seconds for win, 3 seconds for lose)
    const timeout = hasWin ? 5000 : 3000;
    resultDisplayTimeout = setTimeout(() => {
      resultContainer.style.display = 'none';
    }, timeout);
  } catch (error) {
    console.error("Error showing win/loss result:", error);
  }
}

// Helper function to capitalize first letter
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

// ======== HISTORY TAB MANAGEMENT ========

// Setup history tabs
function setupHistoryTabs() {
  try {
    const gameTabs = document.querySelectorAll('.gh-tab');
    if (!gameTabs || gameTabs.length < 3) {
      console.warn("History tabs not found");
      return;
    }
    
    // Game history tab
    gameTabs[0].addEventListener('click', () => {
      switchHistoryTab('game');
    });
    
    // My history tab
    gameTabs[2].addEventListener('click', () => {
      switchHistoryTab('user');
    });

  } catch (error) {
    console.error("Error setting up history tabs:", error);
  }
}

// Switch between history tabs
function switchHistoryTab(tabName) {
  try {
    if (tabName === currentHistoryTab) {
      showToast("Already viewing this tab");
      return;
    }
    
    const historyTable = document.querySelector('.gh-table');
    const userHistoryContainer = document.getElementById('userHistoryContainer');
    const gameTabs = document.querySelectorAll('.gh-tab');
    
    if (!historyTable || !userHistoryContainer || !gameTabs || gameTabs.length < 3) {
      console.warn("History elements not found");
      return;
    }
    
    // Update tab styling
    if (tabName === 'game') {
      gameTabs[0].classList.add('active');
      gameTabs[2].classList.remove('active');
      
      historyTable.style.display = '';
      userHistoryContainer.style.display = 'none';
      
      // Update game history
      updateGameHistoryDisplay();
    } else if (tabName === 'user') {
      gameTabs[0].classList.remove('active');
      gameTabs[2].classList.add('active');
      
      historyTable.style.display = 'none';
      userHistoryContainer.style.display = 'block';
      
      // Check if user is logged in
      if (!currentUser) {
        userHistoryContainer.innerHTML = `
          <div class="empty-history-message">
            Please login to view your betting history
          </div>
        `;
        showToast("Login required to view your history", false);
        return;
      }
      
      // Load user betting history
      loadUserBettingHistory();
    }
    
    currentHistoryTab = tabName;
    

  } catch (error) {
    console.error("Error switching history tab:", error);
  }
}

// Load user's betting history
async function loadUserBettingHistory() {
  try {
    if (!currentUser) {

      return;
    }
    
    const userHistoryContainer = document.getElementById('userHistoryContainer');
    if (!userHistoryContainer) {
      console.warn("User history container not found");
      return;
    }
    
    // Only refresh history if it's the first load or tab is active
    if (!historyTabInitialized || currentHistoryTab === 'user') {
      // Show loading state
      userHistoryContainer.innerHTML = `
        <div style="text-align: center; padding: 20px;">
          <div>Loading your betting history...</div>
        </div>
      `;
      
      // Get all user's bets from all periods
      let userHistory = [];
      
      try {
        // Get most recent 50 periods from history
        const periodsRef = ref(db, 'PERIOD_COUNT/history');
        const periodsQuery = query(periodsRef, limitToLast(50));
        const periodsSnapshot = await get(periodsQuery);
        
        if (periodsSnapshot.exists()) {
          const periods = periodsSnapshot.val();
          let periodPromises = [];
          
          // For each period, check if user has bets
          for (const periodKey in periods) {
            const periodData = periods[periodKey];
            const periodNumber = periodData.period_number;
            
            const promise = get(ref(db, `CurrentGameBets/${periodNumber}/${currentUser.uid}`))
              .then(snapshot => {
                if (snapshot.exists()) {
                  const userBets = snapshot.val();
                  
                  // Process each bet
                  for (const betId in userBets) {
                    const bet = userBets[betId];
                    
                    // Only add bets that have been processed (have a result)
                    if (bet.bet_status === 'win' || bet.bet_status === 'lose') {
                      userHistory.push({
                        period: periodNumber,
                        betType: bet.bet_type,
                        selectedValue: bet.user_selected_value,
                        amount: bet.user_total_amount,
                        winAmount: bet.win_amount || 0,
                        isWin: bet.bet_status === 'win',
                        resultNumber: bet.result_number,
                        resultColor: bet.result_color,
                        resultBigSmall: bet.result_bigSmall
                      });
                    }
                  }
                }
              })
              .catch(error => {
                console.error(`Error getting bets for period ${periodNumber}:`, error);
              });
            
            periodPromises.push(promise);
          }
          
          // Wait for all periods to be processed
          await Promise.all(periodPromises);
          
          // Sort history by period (newest first)
          userHistory.sort((a, b) => parseInt(b.period) - parseInt(a.period));
          
          // Cache the history data
          userHistoryData = userHistory;
          

          
          // Display the history
          displayUserHistory(userHistory);
          
          // Set flag to avoid reloading unnecessarily
          historyTabInitialized = true;
        } else {

          userHistoryContainer.innerHTML = `
            <div class="empty-history-message">
              No betting history found
            </div>
          `;
        }
      } catch (error) {
        console.error("Error loading user betting history:", error);
        userHistoryContainer.innerHTML = `
          <div class="empty-history-message">
            Error loading your betting history
          </div>
        `;
      }
    }
  } catch (error) {
    console.error("Error loading user betting history:", error);
  }
}

// Display user history
function displayUserHistory(history) {
  try {
    const userHistoryContainer = document.getElementById('userHistoryContainer');
    if (!userHistoryContainer) return;
    
    // Clear existing content
    userHistoryContainer.innerHTML = '';
    
    if (history.length === 0) {
      userHistoryContainer.innerHTML = `
        <div class="empty-history-message">
          No betting history found
        </div>
      `;
      return;
    }
    
    // Create history elements
    for (let i = 0; i < history.length; i++) {
      const item = history[i];
      const isLatest = i === 0; // First item is the latest
      
      const historyItem = document.createElement('div');
      historyItem.className = `user-history-row user-history-${item.isWin ? 'win' : 'lose'}`;
      
      // Get appropriate bet type label
      let betTypeLabel = '';
      let selectedValueDisplay = '';
      
      if (item.betType === 'number') {
        betTypeLabel = 'Number';
        selectedValueDisplay = item.selectedValue;
      } else if (item.betType === 'color') {
        betTypeLabel = 'Color';
        selectedValueDisplay = capitalizeFirstLetter(item.selectedValue);
      } else if (item.betType === 'bigSmall') {
        betTypeLabel = 'Size';
        selectedValueDisplay = capitalizeFirstLetter(item.selectedValue);
      }
      
      // Add "Latest" badge if this is the most recent item
      const latestBadge = isLatest ? `<div class="latest-result-badge">Latest</div>` : '';
      
      historyItem.innerHTML = `
        ${latestBadge}
        <div class="user-history-details">
          <div class="user-history-period">Period: ${item.period}</div>
          <div class="user-history-bet-type">Bet: ${betTypeLabel}</div>
          <div class="user-history-result">
            <div class="user-history-value">${selectedValueDisplay}</div>
            <div class="user-history-amount">${item.isWin ? '+' : '-'}₹${formatIndianNumber(item.isWin ? item.winAmount : item.amount)}</div>
          </div>
        </div>
      `;
      
      userHistoryContainer.appendChild(historyItem);
    }
  } catch (error) {
    console.error("Error displaying user history:", error);
  }
}

// Setup history pagination
function setupHistoryPagination() {
  try {
    // Next button event listener
    const nextBtn = document.querySelector('.gh-page-btn.next');
    if (nextBtn) {
      nextBtn.addEventListener('click', nextHistoryPage);
    }
    
    // Previous button event listener
    const prevBtn = document.querySelector('.gh-page-btn.prev');
    if (prevBtn) {
      prevBtn.addEventListener('click', prevHistoryPage);
    }
    

  } catch (error) {
    console.error("Error setting up history pagination:", error);
  }
}

// Go to next history page
function nextHistoryPage() {
  try {
    if (currentHistoryPage < totalHistoryPages) {
      currentHistoryPage++;
      displayHistoryPage(currentHistoryPage);
    }
  } catch (error) {
    console.error("Error going to next history page:", error);
  }
}

// Go to previous history page
function prevHistoryPage() {
  try {
    if (currentHistoryPage > 1) {
      currentHistoryPage--;
      displayHistoryPage(currentHistoryPage);
    }
  } catch (error) {
    console.error("Error going to previous history page:", error);
  }
}

// Display specific history page

function displayHistoryPage(page) {
  try {
    // Get the history container
    const historyContainer = document.querySelector('.gh-table');
    if (!historyContainer) {
      console.warn("History container not found");
      return;
    }
    
    // Get header element
    const headerElement = historyContainer.querySelector('.gh-table-header');
    if (!headerElement) {
      console.warn("History header not found");
      return;
    }
    
    // Show items for the requested page
    const pageSize = 10;
    const startIdx = (page - 1) * pageSize;
    const endIdx = page * pageSize;
    const pageItems = cachedHistoryData.slice(startIdx, endIdx);
    
    // Clear existing rows except header
    const existingRows = historyContainer.querySelectorAll('.gh-row');
    existingRows.forEach(row => row.remove());
    
    // Create a document fragment to build all rows (better performance)
    const fragment = document.createDocumentFragment();
    
    // Display items for this page
    pageItems.forEach((period, index) => {
      // Create row element
      const rowElement = document.createElement('div');
      rowElement.className = 'gh-row';
      
      // Add latest badge to first item on first page
      const isLatest = page === 1 && index === 0;
      const latestBadge = isLatest ?
        `<div class="latest-result-badge">Latest</div>` : '';
      
      // Generate color dots HTML for the winning number
      const colorData = numberColors[period.win_number];
      let colorDots = '';
      
      if (colorData && colorData.colors) {
        colorData.colors.forEach(color => {
          const colorClass = (color.trim() === 'violet') ? 'purple' : color.trim();
          colorDots += `<span class="gh-dot gh-dot-${colorClass}"></span>`;
        });
      }
      
      rowElement.innerHTML = `
        ${latestBadge}
        <div class="gh-cell gh-period">${period.period_number}</div>
        <div class="gh-cell gh-number">
          <span class="gh-num-value gh-num-${period.win_number}">${period.win_number}</span>
        </div>
        <div class="gh-cell gh-size">${capitalizeFirstLetter(period.win_bigSmall)}</div>
        <div class="gh-cell gh-color">
          <div class="gh-dots">
            ${colorDots}
          </div>
        </div>
      `;
      
      // Add to fragment
      fragment.appendChild(rowElement);
    });
    
    // Insert all rows after header in one operation
    const insertPoint = headerElement.nextSibling;
    historyContainer.insertBefore(fragment, insertPoint);
    
    // Update pagination info
    const paginationInfo = document.querySelector('.gh-page-info');
    if (paginationInfo) {
      paginationInfo.textContent = `${page}/${totalHistoryPages}`;
    }
    

  } catch (error) {
    console.error("Error displaying history page:", error);
  }
}


















// Update game history display with optimized loading - IMPROVED for ordering

function updateGameHistoryDisplay() {
  try {
    // If we're viewing user history, don't update the game history
    if (currentHistoryTab === 'user') {

      return;
    }
    
    // Performance optimization: Use cached data if available
    if (cachedHistoryData.length > 0) {
      // Just update the display with existing cached data
      displayHistoryPage(currentHistoryPage);
      
      // Refresh cache in the background
      refreshHistoryCache();
      return;
    }
    
    // If no cached data, load from database with a limit
    loadHistoryFromDatabase();
  } catch (error) {
    console.error("Error updating game history display:", error);
  }
}


































// Load history from database with optimization - IMPROVED for ordering
function loadHistoryFromDatabase() {
  try {

    
    // Use the history node directly
    const historyRef = ref(db, 'PERIOD_COUNT/history');
    
    get(historyRef).then((snapshot) => {
      if (snapshot.exists()) {
        // Convert to array and process
        const historyData = snapshot.val();
        processFreshHistoryData(historyData);
      } else {

        
        // Try from localStorage as fallback
        loadHistoryFromLocalStorage();
      }
    }).catch(error => {
      console.error("Error fetching history data:", error);
      // Fallback to localStorage
      loadHistoryFromLocalStorage();
    });
  } catch (error) {
    console.error("Error loading history from database:", error);
    // Fallback to localStorage
    loadHistoryFromLocalStorage();
  }
}

// Process fresh history data - IMPROVED for ordering
function processFreshHistoryData(historyData) {
  try {
    // Convert to array
    const periods = Object.values(historyData);
    
    // Sort by period number (newest first)
    periods.sort((a, b) => parseInt(b.period_number) - parseInt(a.period_number));
    
    // Update cached data
    cachedHistoryData = periods;
    
    // Save to localStorage
    localStorage.setItem('wingo_game_history', JSON.stringify(periods.slice(0, 100)));
    
    // Calculate total pages
    totalHistoryPages = Math.ceil(periods.length / 10) || 1;
    
    // Reset to first page when data refreshes
    currentHistoryPage = 1;
    
    // Display first page
    displayHistoryPage(1);
    

  } catch (error) {
    console.error("Error processing fresh history data:", error);
  }
}

// Refresh cache in background - IMPROVED for ordering
function refreshHistoryCache() {
  setTimeout(() => {
    const historyRef = ref(db, 'PERIOD_COUNT/history');
    
    get(historyRef).then((snapshot) => {
      if (snapshot.exists()) {
        const historyData = snapshot.val();
        const periods = Object.values(historyData);
        
        // Sort by period number (newest first)
        periods.sort((a, b) => parseInt(b.period_number) - parseInt(a.period_number));
        
        // Update cached data without changing display
        cachedHistoryData = periods;
        
        // Save to localStorage
        localStorage.setItem('wingo_game_history', JSON.stringify(periods.slice(0, 100)));
        
        // Update total pages
        totalHistoryPages = Math.ceil(periods.length / 10) || 1;
        

      }
    }).catch(error => {
      console.error("Error refreshing history cache:", error);
    });
  }, 100); // Small delay to not block UI
}

// Load history from localStorage
function loadHistoryFromLocalStorage() {
  try {
    const localHistoryString = localStorage.getItem('wingo_game_history');
    if (localHistoryString) {
      try {
        const localHistory = JSON.parse(localHistoryString);
        if (Array.isArray(localHistory) && localHistory.length > 0) {
          // Sort by period number (newest first)
          localHistory.sort((a, b) => parseInt(b.period_number) - parseInt(a.period_number));
          
          cachedHistoryData = localHistory;
          totalHistoryPages = Math.ceil(localHistory.length / 10) || 1;
          currentHistoryPage = 1;
          
          displayHistoryPage(1);

        } else {

        }
      } catch (e) {
        console.error("Error parsing history from localStorage:", e);
      }
    } else {

    }
  } catch (error) {
    console.error("Error loading history from localStorage:", error);
  }
}

// Function to refresh user balance (for UI button)
function refreshBalance() {
  if (currentUser) {
    loadUserBalance();
    showToast("Balance refreshed");
  } else {
    showToast("Please login to view balance", false);
  }
}

// Initialize game on page load
document.addEventListener('DOMContentLoaded', initializeGame);

// Helper function to manually check admin override (for debugging)
async function checkAdminOverride() {
  try {
    const adminOverrideRef = ref(db, `adminOverride/${currentGamePeriod}`);
    const snapshot = await get(adminOverrideRef);
    
    if (snapshot.exists()) {
      console.log('%c 🔥 ADMIN OVERRIDE FOUND 🔥 ', 'background: #f00; color: #fff; font-size: 16px; font-weight: bold;');
      console.log('Override data:', snapshot.val());
      return snapshot.val();
    } else {
      console.log('%c ❌ NO ADMIN OVERRIDE FOUND ❌ ', 'background: #999; color: #fff; font-size: 14px;');
      return null;
    }
  } catch (error) {
    console.error('Error checking admin override:', error);
    return null;
  }
}

// Export functions to window object
window.setupBetOnElement = setupBetOnElement;
window.setOnBetElement = setOnBetElement;
window.placeBet = placeBet;
window.generateGameResult = generateGameResult;
window.start_overlay = start_overlay;
window.initializeGame = initializeGame;
window.formatIndianNumber = formatIndianNumber;
window.refreshBalance = refreshBalance;
window.showWinLossResult = showWinLossResult;
window.nextHistoryPage = nextHistoryPage;
window.prevHistoryPage = prevHistoryPage;
window.switchHistoryTab = switchHistoryTab;
window.checkAdminOverride = checkAdminOverride;
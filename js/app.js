// js/app.js — Todo Life Dashboard application logic

// =============================================================================
// ThemeToggle
// Toggles dark/light mode by adding/removing the 'dark-mode' class on body.
// Persists the user's preference to localStorage.
// =============================================================================

const ThemeToggle = {
  toggleEl: null,
  labelEl: null,

  init() {
    this.toggleEl = document.getElementById('theme-toggle');
    this.labelEl = document.getElementById('theme-label');

    if (!this.toggleEl) return;

    // Restore saved preference
    const saved = localStorage.getItem('theme-preference');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = saved ? saved === 'dark' : prefersDark;

    if (isDark) {
      this.applyDark();
      this.toggleEl.checked = true;
    }

    this.toggleEl.addEventListener('change', () => {
      if (this.toggleEl.checked) {
        this.applyDark();
        localStorage.setItem('theme-preference', 'dark');
      } else {
        this.applyLight();
        localStorage.setItem('theme-preference', 'light');
      }
      // Re-apply section colours for the new theme
      if (typeof SectionColors !== 'undefined') SectionColors.apply();
    });
  },

  applyDark() {
    document.body.classList.add('dark-mode');
    if (this.labelEl) this.labelEl.textContent = 'Dark Mode';
    if (this.toggleEl) this.toggleEl.setAttribute('aria-checked', 'true');
  },

  applyLight() {
    document.body.classList.remove('dark-mode');
    if (this.labelEl) this.labelEl.textContent = 'Light Mode';
    if (this.toggleEl) this.toggleEl.setAttribute('aria-checked', 'false');
  },
};

// =============================================================================
// Button Ripple Effect
// Adds a visual ripple animation on every button click.
// =============================================================================

function addRipple(event) {
  const button = event.currentTarget;
  const ripple = document.createElement('span');
  ripple.classList.add('ripple');

  const rect = button.getBoundingClientRect();
  const size = Math.max(rect.width, rect.height);
  const x = event.clientX - rect.left - size / 2;
  const y = event.clientY - rect.top - size / 2;

  ripple.style.width = ripple.style.height = `${size}px`;
  ripple.style.left = `${x}px`;
  ripple.style.top = `${y}px`;

  button.appendChild(ripple);
  ripple.addEventListener('animationend', () => ripple.remove());
}

function attachRippleToAll() {
  document.querySelectorAll('button').forEach((btn) => {
    btn.removeEventListener('click', addRipple); // avoid duplicates
    btn.addEventListener('click', addRipple);
  });
}

// =============================================================================
// StorageManager
// Thin wrapper around localStorage providing JSON serialization / deserialization
// with centralised error handling for quota-exceeded and parse failures.
// =============================================================================

const StorageManager = {
  /**
   * Serialize `data` to JSON and write it to localStorage under `key`.
   * @param {string} key
   * @param {*} data  — any JSON-serializable value
   * @returns {{ ok: true } | { ok: false, error: string }}
   */
  save(key, data) {
    try {
      const serialized = JSON.stringify(data);
      localStorage.setItem(key, serialized);
      return { ok: true };
    } catch (err) {
      // DOMException name for quota exceeded is "QuotaExceededError"
      if (
        err instanceof DOMException &&
        (err.name === 'QuotaExceededError' ||
          err.name === 'NS_ERROR_DOM_QUOTA_REACHED')
      ) {
        return { ok: false, error: 'QuotaExceeded' };
      }
      return { ok: false, error: err.message || 'AccessDenied' };
    }
  },

  /**
   * Read the value stored under `key`, parse it as JSON, and return it.
   * @param {string} key
   * @returns {{ ok: true, data: * } | { ok: false }}
   */
  load(key) {
    try {
      const raw = localStorage.getItem(key);
      if (raw === null) {
        // Key does not exist
        return { ok: false };
      }
      const data = JSON.parse(raw);
      return { ok: true, data };
    } catch (_err) {
      // JSON.parse failure (corrupted data) or any other read error
      return { ok: false };
    }
  },
};

// =============================================================================
// GreetingWidget
// Displays current time, date, and a time-of-day greeting.
// Updates every 60 seconds.
// =============================================================================

/**
 * Pure function: maps hour [0–23] to greeting string.
 * @param {number} h — hour in [0, 23]
 * @returns {string} — one of: "Good Morning", "Good Afternoon", "Good Evening", "Good Night"
 */
function getGreeting(h) {
  if (h >= 5 && h < 12) return 'Good Morning';
  if (h >= 12 && h < 18) return 'Good Afternoon';
  if (h >= 18 && h < 21) return 'Good Evening';
  return 'Good Night'; // [0, 4] ∪ [21, 23]
}

/**
 * Pure function: formats a Date to "HH:MM" string with zero-padding.
 * @param {Date} date
 * @returns {string} — e.g., "08:42"
 */
function formatTime(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

/**
 * Pure function: formats a Date to "Weekday, D Month YYYY" string.
 * @param {Date} date
 * @returns {string} — e.g., "Monday, 2 June 2025"
 */
function formatDate(date) {
  const weekdays = [
    'Sunday',
    'Monday',
    'Tuesday',
    'Wednesday',
    'Thursday',
    'Friday',
    'Saturday',
  ];
  const months = [
    'January',
    'February',
    'March',
    'April',
    'May',
    'June',
    'July',
    'August',
    'September',
    'October',
    'November',
    'December',
  ];

  const weekday = weekdays[date.getDay()];
  const day = date.getDate();
  const month = months[date.getMonth()];
  const year = date.getFullYear();

  return `${weekday}, ${day} ${month} ${year}`;
}

const GreetingWidget = {
  greetingEl: null,
  timeEl: null,
  dateEl: null,
  nameInputEl: null,
  nameFormEl: null,
  nameErrorEl: null,
  intervalId: null,
  userName: '',

  /**
   * Initialize the widget: set up DOM refs and start the 60-second interval.
   */
  init() {
    this.greetingEl = document.getElementById('greeting-text');
    this.timeEl = document.getElementById('time-display');
    this.dateEl = document.getElementById('date-display');
    this.nameInputEl = document.getElementById('name-input');
    this.nameFormEl = document.getElementById('name-form');
    this.nameErrorEl = document.getElementById('name-error');

    // Restore saved name
    const saved = localStorage.getItem('dashboard-user-name');
    if (saved) {
      this.userName = saved;
      if (this.nameInputEl) this.nameInputEl.value = saved;
    }

    // Wire form submission
    if (this.nameFormEl) {
      this.nameFormEl.addEventListener('submit', (e) => {
        e.preventDefault();
        const raw = this.nameInputEl ? this.nameInputEl.value.trim() : '';
        if (!raw) {
          if (this.nameErrorEl) this.nameErrorEl.textContent = 'Please enter a name.';
          if (this.nameInputEl) this.nameInputEl.focus();
          return;
        }
        if (raw.length > 50) {
          if (this.nameErrorEl) this.nameErrorEl.textContent = 'Name must be 50 characters or fewer.';
          return;
        }
        if (this.nameErrorEl) this.nameErrorEl.textContent = '';
        this.userName = raw;
        localStorage.setItem('dashboard-user-name', raw);
        this.render();
      });
    }

    // Initial render
    this.render();

    // Update every 60 seconds
    this.intervalId = setInterval(() => {
      this.render();
    }, 60000);
  },

  /**
   * Read current Date and update all three text elements.
   */
  render() {
    const now = new Date();
    const h = now.getHours();
    const greeting = getGreeting(h);
    const name = this.userName ? `, ${this.userName}` : '';

    if (this.greetingEl) this.greetingEl.textContent = `${greeting}${name}!`;
    if (this.timeEl) this.timeEl.textContent = formatTime(now);
    if (this.dateEl) this.dateEl.textContent = formatDate(now);
  },
};

// =============================================================================
// FocusTimer
// 25-minute Pomodoro countdown with start/stop/reset controls.
// Plays an audible beep and shows a browser alert on completion.
// =============================================================================

/**
 * Pure function: convert seconds [0–1500] to "MM:SS" string.
 * @param {number} s — seconds (0 to 1500)
 * @returns {string} — zero-padded MM:SS format
 */
function formatMMSS(s) {
  const minutes = Math.floor(s / 60);
  const seconds = s % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(seconds).padStart(2, '0');
  return `${mm}:${ss}`;
}

const FocusTimer = {
  remaining: 1500, // seconds
  duration: 1500,  // custom duration in seconds
  intervalId: null,
  timerDisplay: null,
  startButton: null,
  stopButton: null,
  resetButton: null,
  setButton: null,
  minutesInput: null,
  setErrorEl: null,
  modeLabelEl: null,
  presetButtons: null,

  /**
   * Set up DOM references and wire button click handlers.
   * Called once on page load.
   */
  init() {
    this.timerDisplay = document.getElementById('timer-display');
    this.startButton = document.getElementById('timer-start');
    this.stopButton = document.getElementById('timer-stop');
    this.resetButton = document.getElementById('timer-reset');
    this.setButton = document.getElementById('timer-set');
    this.minutesInput = document.getElementById('timer-minutes');
    this.setErrorEl = document.getElementById('timer-set-error');
    this.modeLabelEl = document.getElementById('timer-mode-label');
    this.presetButtons = document.querySelectorAll('.preset-btn');

    this.startButton.addEventListener('click', () => this.start());
    this.stopButton.addEventListener('click', () => this.stop());
    this.resetButton.addEventListener('click', () => this.reset());
    this.setButton.addEventListener('click', () => this.setDuration());

    // Preset buttons
    this.presetButtons.forEach((btn) => {
      btn.addEventListener('click', () => {
        const minutes = parseInt(btn.dataset.minutes, 10);
        this.applyPreset(minutes, btn.textContent.trim());
        // Update active state
        this.presetButtons.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Allow pressing Enter in the minutes input
    if (this.minutesInput) {
      this.minutesInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') this.setDuration();
      });
      // Clear active preset when user types custom value
      this.minutesInput.addEventListener('input', () => {
        this.presetButtons.forEach((b) => b.classList.remove('active'));
        if (this.modeLabelEl) this.modeLabelEl.textContent = '⏱ Custom';
      });
    }

    // Stop button starts disabled (timer isn't running yet)
    if (this.stopButton) this.stopButton.disabled = true;

    this.render();
  },

  /**
   * Apply a preset duration without the form validation flow.
   * @param {number} minutes
   * @param {string} label
   */
  applyPreset(minutes, label) {
    if (this.intervalId !== null) {
      if (this.setErrorEl) this.setErrorEl.textContent = 'Stop the timer before changing duration.';
      return;
    }
    if (this.setErrorEl) this.setErrorEl.textContent = '';
    this.duration = minutes * 60;
    this.remaining = this.duration;
    if (this.minutesInput) this.minutesInput.value = minutes;
    if (this.modeLabelEl) this.modeLabelEl.textContent = label;
    this.render();
  },

  /**
   * Read the minutes input and update the timer duration.
   * Only allowed when timer is not running.
   */
  setDuration() {
    if (this.intervalId !== null) {
      if (this.setErrorEl) this.setErrorEl.textContent = 'Stop the timer before changing duration.';
      return;
    }

    const raw = this.minutesInput ? this.minutesInput.value : '';
    const minutes = parseInt(raw, 10);

    if (isNaN(minutes) || minutes < 1 || minutes > 180) {
      if (this.setErrorEl) this.setErrorEl.textContent = 'Enter a value between 1 and 180 minutes.';
      if (this.minutesInput) this.minutesInput.focus();
      return;
    }

    if (this.setErrorEl) this.setErrorEl.textContent = '';
    this.duration = minutes * 60;
    this.remaining = this.duration;
    this.render();
  },

  start() {
    if (this.intervalId !== null) return;
    this.intervalId = setInterval(() => this.tick(), 1000);
    if (this.startButton) { this.startButton.classList.add('running'); this.startButton.textContent = 'Running…'; this.startButton.disabled = true; }
    if (this.stopButton) this.stopButton.disabled = false;
    if (this.setButton) this.setButton.disabled = true;
    if (this.minutesInput) this.minutesInput.disabled = true;
    if (this.presetButtons) this.presetButtons.forEach((b) => b.disabled = true);
  },

  stop() {
    if (this.intervalId === null) return;
    clearInterval(this.intervalId);
    this.intervalId = null;
    if (this.startButton) { this.startButton.classList.remove('running'); this.startButton.textContent = 'Start'; this.startButton.disabled = false; }
    if (this.stopButton) this.stopButton.disabled = true;
    if (this.setButton) this.setButton.disabled = false;
    if (this.minutesInput) this.minutesInput.disabled = false;
    if (this.presetButtons) this.presetButtons.forEach((b) => b.disabled = false);
  },

  /**
   * Stop the timer, restore remaining to custom duration, and update display.
   */
  reset() {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.remaining = this.duration;
    if (this.startButton) { this.startButton.classList.remove('running'); this.startButton.textContent = 'Start'; this.startButton.disabled = false; }
    if (this.stopButton) this.stopButton.disabled = true;
    if (this.setButton) this.setButton.disabled = false;
    if (this.minutesInput) this.minutesInput.disabled = false;
    if (this.presetButtons) this.presetButtons.forEach((b) => b.disabled = false);
    this.render();
  },

  /**
   * Decrement remaining by 1 second.
   * If remaining reaches 0, call finish().
   */
  tick() {
    this.remaining -= 1;
    if (this.remaining <= 0) {
      this.remaining = 0;
      this.finish();
    } else {
      this.render();
    }
  },

  /**
   * Stop the timer, play a beep, and show an alert.
   */
  finish() {
    this.stop(); // stop() already re-enables set button + input
    this.playBeep();
    alert('Time is up! Great work on your focus session 🎉');
  },

  /**
   * Play an audible beep using the Web Audio API.
   * Gracefully degrades if AudioContext is unavailable.
   */
  playBeep() {
    try {
      // Create an AudioContext instance
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) {
        // AudioContext not supported → silent fallback
        return;
      }
      const context = new AudioContext();
      const oscillator = context.createOscillator();
      const gainNode = context.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(context.destination);

      oscillator.frequency.value = 440; // A4 note (440 Hz)
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, context.currentTime);

      const duration = 1; // 1 second
      oscillator.start(context.currentTime);
      oscillator.stop(context.currentTime + duration);
    } catch (err) {
      // AudioContext creation or operation failed → silent fallback
    }
  },

  /**
   * Update the #timer-display element with the current remaining time.
   */
  render() {
    if (this.timerDisplay) {
      this.timerDisplay.textContent = formatMMSS(this.remaining);
    }
  },
};

// =============================================================================
// TodoList
// Manage a list of Task objects with add, edit, toggle, and delete operations.
// All tasks persist to localStorage.
// =============================================================================

/**
 * Generate a unique ID for a task or link.
 * @returns {string}
 */
function generateId() {
  return Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}

const TodoList = {
  tasks: [],
  sortOrder: 'newest',
  listEl: null,
  formEl: null,
  inputEl: null,
  errorEl: null,
  sortSelectEl: null,

  /**
   * Initialize the TodoList: load from storage, render, and wire event handlers.
   */
  init() {
    this.listEl = document.getElementById('todo-list-items');
    this.formEl = document.getElementById('todo-form');
    this.inputEl = document.getElementById('todo-input');
    this.errorEl = document.getElementById('todo-error');
    this.sortSelectEl = document.getElementById('todo-sort-select');

    // Load saved tasks from storage
    this.load();

    // Restore saved sort preference
    const savedSort = localStorage.getItem('todo-sort-order');
    if (savedSort && this.sortSelectEl) {
      this.sortOrder = savedSort;
      this.sortSelectEl.value = savedSort;
    }

    // Render the initial task list
    this.render();

    // Wire form submission
    if (this.formEl) {
      this.formEl.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = this.inputEl?.value.trim() || '';
        this.addTask(text);
      });
    }

    // Wire sort select
    if (this.sortSelectEl) {
      this.sortSelectEl.addEventListener('change', () => {
        this.sortOrder = this.sortSelectEl.value;
        localStorage.setItem('todo-sort-order', this.sortOrder);
        this.render();
      });
    }
  },

  /**
   * Return a sorted copy of tasks based on current sortOrder.
   * @returns {Object[]}
   */
  getSortedTasks() {
    const copy = [...this.tasks];
    switch (this.sortOrder) {
      case 'oldest':
        return copy.sort((a, b) => a.createdAt - b.createdAt);
      case 'active':
        return copy.sort((a, b) => {
          if (a.completed === b.completed) return b.createdAt - a.createdAt;
          return a.completed ? 1 : -1;
        });
      case 'completed':
        return copy.sort((a, b) => {
          if (a.completed === b.completed) return b.createdAt - a.createdAt;
          return a.completed ? -1 : 1;
        });
      case 'alpha-asc':
        return copy.sort((a, b) => a.text.localeCompare(b.text));
      case 'alpha-desc':
        return copy.sort((a, b) => b.text.localeCompare(a.text));
      case 'newest':
      default:
        return copy.sort((a, b) => b.createdAt - a.createdAt);
    }
  },

  /**
   * Load tasks from localStorage. Initialize to empty array on failure.
   */
  load() {
    const result = StorageManager.load('todo-dashboard-tasks');
    if (result.ok && Array.isArray(result.data)) {
      this.tasks = result.data;
    } else {
      this.tasks = [];
    }
  },

  /**
   * Save tasks to localStorage. Display error if save fails.
   */
  save() {
    const result = StorageManager.save('todo-dashboard-tasks', this.tasks);
    if (!result.ok) {
      if (this.errorEl) {
        this.errorEl.textContent = 'Failed to save tasks to storage.';
      }
    } else {
      // Clear error on successful save
      if (this.errorEl) {
        this.errorEl.textContent = '';
      }
    }
  },

  /**
   * Add a new task with the given text.
   * @param {string} text
   */
  addTask(text) {
    // Validate non-empty and max 500 chars
    if (!text || text.length === 0) {
      // Silently reject empty input; keep focus
      if (this.inputEl) this.inputEl.focus();
      return;
    }

    // Truncate to 500 chars if needed
    const truncated = text.length > 500 ? text.slice(0, 500) : text;

    // Prevent duplicate tasks (case-insensitive)
    const isDuplicate = this.tasks.some(
      (t) => t.text.toLowerCase() === truncated.toLowerCase()
    );
    if (isDuplicate) {
      if (this.errorEl) {
        this.errorEl.textContent = 'This task already exists.';
        // Auto-clear the message after 3 seconds
        setTimeout(() => {
          if (this.errorEl) this.errorEl.textContent = '';
        }, 3000);
      }
      if (this.inputEl) this.inputEl.focus();
      return;
    }

    // Create new task
    const task = {
      id: generateId(),
      text: truncated,
      completed: false,
      createdAt: Date.now(),
    };

    this.tasks.push(task);
    this.save();
    this.render();

    // Clear input and keep focus
    if (this.inputEl) {
      this.inputEl.value = '';
      this.inputEl.focus();
    }
  },

  /**
   * Toggle the completion state of a task.
   * @param {string} id
   */
  toggleComplete(id) {
    const task = this.tasks.find((t) => t.id === id);
    if (task) {
      task.completed = !task.completed;
      this.save();
      this.render();
    }
  },

  /**
   * Delete a task by ID.
   * @param {string} id
   */
  deleteTask(id) {
    if (!confirm('Delete this task?')) return;
    this.tasks = this.tasks.filter((t) => t.id !== id);
    this.save();
    this.render();
  },

  /**
   * Render the task list.
   */
  render() {
    if (!this.listEl) return;

    // Clear list
    this.listEl.innerHTML = '';

    // Render each task in sorted order
    this.getSortedTasks().forEach((task) => {
      const li = this.renderTask(task);
      this.listEl.appendChild(li);
    });

    // Re-attach ripple to dynamically created buttons
    attachRippleToAll();
    SectionColors.colorizeButtons();
  },

  /**
   * Render a single task item.
   * @param {Object} task
   * @returns {HTMLElement}
   */
  renderTask(task) {
    const li = document.createElement('li');
    li.className = 'task-item';
    if (task.completed) {
      li.classList.add('completed');
    }
    li.dataset.id = task.id;

    // Checkbox
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'task-toggle';
    checkbox.checked = task.completed;
    checkbox.addEventListener('change', () => this.toggleComplete(task.id));

    // Text span
    const textSpan = document.createElement('span');
    textSpan.className = 'task-text';
    textSpan.textContent = task.text;

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'task-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => this.deleteTask(task.id));

    li.appendChild(checkbox);
    li.appendChild(textSpan);
    li.appendChild(deleteBtn);

    return li;
  },
};

// =============================================================================
// QuickLinks
// Manage a list of Link objects with add and delete operations.
// All links persist to localStorage.
// =============================================================================

const QuickLinks = {
  links: [],
  containerEl: null,
  formEl: null,
  labelInputEl: null,
  urlInputEl: null,
  labelErrorEl: null,
  urlErrorEl: null,

  /**
   * Initialize QuickLinks: load from storage, render, and wire event handlers.
   */
  init() {
    this.containerEl = document.getElementById('links-container');
    this.formEl = document.getElementById('links-form');
    this.labelInputEl = document.getElementById('link-label-input');
    this.urlInputEl = document.getElementById('link-url-input');
    this.labelErrorEl = document.getElementById('link-label-error');
    this.urlErrorEl = document.getElementById('link-url-error');

    // Load saved links from storage
    this.load();

    // Render the initial link list
    this.render();

    // Wire form submission
    if (this.formEl) {
      this.formEl.addEventListener('submit', (e) => {
        e.preventDefault();
        const label = this.labelInputEl?.value.trim() || '';
        const url = this.urlInputEl?.value.trim() || '';
        this.addLink(label, url);
      });
    }
  },

  /**
   * Load links from localStorage. Initialize to empty array on failure.
   */
  load() {
    const result = StorageManager.load('todo-dashboard-links');
    if (result.ok && Array.isArray(result.data)) {
      this.links = result.data;
    } else {
      this.links = [];
    }
  },

  /**
   * Save links to localStorage. Display warning if save fails.
   */
  save() {
    const result = StorageManager.save('todo-dashboard-links', this.links);
    if (!result.ok) {
      // Display non-blocking warning
      console.warn('Failed to save links to storage:', result.error);
    }
  },

  /**
   * Validate label and URL inputs.
   * @param {string} label
   * @param {string} url
   * @returns {{ labelError?: string, urlError?: string } | null}
   */
  validate(label, url) {
    let labelError = null;
    let urlError = null;

    // Validate label: non-empty, max 100 chars
    if (!label || label.length === 0) {
      labelError = 'Label cannot be empty.';
    } else if (label.length > 100) {
      labelError = 'Label cannot exceed 100 characters.';
    }

    // Validate URL: non-empty, starts with http:// or https://
    if (!url || url.length === 0) {
      urlError = 'URL cannot be empty.';
    } else if (!url.startsWith('http://') && !url.startsWith('https://')) {
      urlError = 'URL must start with http:// or https://';
    }

    if (labelError || urlError) {
      return { labelError, urlError };
    }
    return null;
  },

  /**
   * Add a new link with the given label and URL.
   * @param {string} label
   * @param {string} url
   */
  addLink(label, url) {
    const errors = this.validate(label, url);

    // Display errors if validation fails
    if (errors) {
      if (this.labelErrorEl) {
        this.labelErrorEl.textContent = errors.labelError || '';
      }
      if (this.urlErrorEl) {
        this.urlErrorEl.textContent = errors.urlError || '';
      }
      return;
    }

    // Clear error messages
    if (this.labelErrorEl) this.labelErrorEl.textContent = '';
    if (this.urlErrorEl) this.urlErrorEl.textContent = '';

    // Create new link
    const link = {
      id: generateId(),
      label,
      url,
      createdAt: Date.now(),
    };

    this.links.push(link);
    this.save();
    this.render();

    // Clear inputs
    if (this.labelInputEl) this.labelInputEl.value = '';
    if (this.urlInputEl) this.urlInputEl.value = '';
  },

  /**
   * Delete a link by ID.
   * @param {string} id
   */
  deleteLink(id) {
    if (!confirm('Delete this link?')) return;
    this.links = this.links.filter((link) => link.id !== id);
    this.save();
    this.render();
  },

  /**
   * Open a URL in a new tab.
   * @param {string} url
   */
  openLink(url) {
    window.open(url, '_blank');
  },

  /**
   * Render the links container.
   */
  render() {
    if (!this.containerEl) return;

    // Clear container
    this.containerEl.innerHTML = '';

    // Render each link
    this.links.forEach((link) => {
      const linkItem = this.renderLink(link);
      this.containerEl.appendChild(linkItem);
    });

    // Re-attach ripple to dynamically created buttons
    attachRippleToAll();
    SectionColors.colorizeButtons();
  },

  /**
   * Render a single link item.
   * @param {Object} link
   * @returns {HTMLElement}
   */
  renderLink(link) {
    const wrapper = document.createElement('div');
    wrapper.className = 'link-item';
    wrapper.dataset.id = link.id;

    // Link button
    const linkBtn = document.createElement('button');
    linkBtn.className = 'link-button';
    linkBtn.textContent = link.label;
    linkBtn.addEventListener('click', () => this.openLink(link.url));

    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'link-delete';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => this.deleteLink(link.id));

    wrapper.appendChild(linkBtn);
    wrapper.appendChild(deleteBtn);

    return wrapper;
  },
};

// =============================================================================
// SectionColors
// Assigns random colours to sections and buttons.
// Palettes are dark-mode-aware: pastel bg in light, deep bg in dark mode.
// Re-applied whenever the theme changes via SectionColors.apply().
// =============================================================================

const SectionColors = {
  // [lightBg, darkBg, accent]
  palettes: [
    ['#fff5f5', '#2d1a1a', '#e74c3c'],  // rose
    ['#fff9f0', '#2d2010', '#e67e22'],  // peach
    ['#fffde7', '#2a2700', '#d4ac0d'],  // yellow
    ['#f0fff4', '#0d2d18', '#27ae60'],  // mint
    ['#e8f8ff', '#0d1e2d', '#2980b9'],  // sky
    ['#f3e8ff', '#1e0d2d', '#8e44ad'],  // lavender
    ['#fde8f5', '#2d0d1e', '#c0392b'],  // pink
    ['#e8f5f3', '#0d2d28', '#16a085'],  // teal
    ['#fff0e8', '#2d1800', '#d35400'],  // orange
    ['#eef2ff', '#0d152d', '#3498db'],  // blue
  ],

  buttonColors: [
    '#e74c3c','#e67e22','#27ae60','#2980b9',
    '#8e44ad','#16a085','#d35400','#c0392b',
    '#3498db','#f39c12','#1abc9c','#9b59b6',
    '#e91e63','#00bcd4','#ff5722','#607d8b',
  ],

  // Shuffle once so sections keep same accent when theme toggles
  _shuffled: null,

  init() {
    this._shuffled = [...this.palettes].sort(() => Math.random() - 0.5);
    this.apply();
  },

  apply() {
    const isDark = document.body.classList.contains('dark-mode');
    const sections = document.querySelectorAll('main.dashboard section');

    sections.forEach((section, i) => {
      const [lightBg, darkBg, accent] = this._shuffled[i % this._shuffled.length];
      section.style.setProperty('--section-bg', isDark ? darkBg : lightBg);
      section.style.setProperty('--section-accent', accent);
    });

    this.colorizeButtons();
  },

  colorizeButtons() {
    const buttons = document.querySelectorAll('button:not(.preset-btn)');
    const colors = [...this.buttonColors].sort(() => Math.random() - 0.5);
    buttons.forEach((btn, i) => {
      const color = colors[i % colors.length];
      btn.style.setProperty('--btn-bg', color);
      btn.style.setProperty('--btn-accent', color);
      btn.style.setProperty('--btn-text', '#fff');
    });

    document.querySelectorAll('.preset-btn').forEach((btn) => {
      const color = colors[Math.floor(Math.random() * colors.length)];
      if (btn.classList.contains('active')) {
        btn.style.setProperty('--btn-bg', color);
        btn.style.setProperty('--btn-accent', color);
        btn.style.setProperty('--btn-text', '#fff');
      } else {
        btn.style.setProperty('--btn-bg', 'transparent');
        btn.style.setProperty('--btn-accent', color);
        btn.style.setProperty('--btn-text', color);
      }
    });
  },
};

// =============================================================================
// Application Initialization
// Called when the DOM is fully loaded to set up all widgets.
// =============================================================================

/**
 * Initialize all dashboard widgets.
 * Called once when the DOM is ready.
 */
function init() {
  ThemeToggle.init();
  SectionColors.init();
  GreetingWidget.init();
  FocusTimer.init();
  TodoList.init();
  QuickLinks.init();
  attachRippleToAll();
}

// Start the app when DOM is ready
if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // DOM is already loaded
    init();
  }
}

// =============================================================================
// Node.js / CommonJS export shim
// Allows the file to be imported in Node.js test suites while still working
// in the browser via a plain <script> tag (no bundler required).
// =============================================================================
if (typeof module !== 'undefined') {
  module.exports = { 
    StorageManager, 
    getGreeting, 
    formatTime, 
    formatDate, 
    GreetingWidget,
    formatMMSS,
    FocusTimer,
    generateId,
    TodoList,
    QuickLinks,
    ThemeToggle,
    SectionColors
  };
}

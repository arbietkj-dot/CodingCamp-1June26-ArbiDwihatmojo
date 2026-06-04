# Design Document: Todo List Life Dashboard

## Overview

The Todo List Life Dashboard is a single-file, client-side productivity application built with pure HTML, CSS, and Vanilla JavaScript. It requires no build step, no backend, and no third-party libraries. Users can open it directly via `file://` protocol or deploy it as a browser extension.

The application presents four independent widgets on a single page:

1. **Greeting_Widget** — shows the local time, full date, and a time-of-day greeting (with customizable user name)
2. **Focus_Timer** — a Pomodoro countdown with customizable duration and start/stop/reset
3. **Todo_List** — a task manager with add/edit/complete/delete, duplicate prevention, and sorting, persisted to localStorage
4. **Quick_Links** — a user-defined URL shortcut board, persisted to localStorage

The application includes global settings for Light/Dark theme mode. All state is stored exclusively in `localStorage`. The app is fully responsive from 320 px to 1920 px width and has no runtime dependencies.

---

## Architecture

The application follows a **widget-based, event-driven architecture** within a single HTML page. Each widget is a self-contained module: it owns its DOM nodes, its state, and its interaction with localStorage.

```mermaid
graph TD
    subgraph Browser
        HTML[index.html]
        CSS[css/style.css]
        JS[js/app.js]

        HTML --> CSS
        HTML --> JS

        subgraph JS
            INIT[init()]
            THEME[ThemeManager]
            GW[GreetingWidget]
            FT[FocusTimer]
            TL[TodoList]
            QL[QuickLinks]
            STORE[StorageManager]
        end

        INIT --> THEME
        INIT --> GW
        INIT --> FT
        INIT --> TL
        INIT --> QL

        THEME --> STORE
        GW --> STORE
        FT --> STORE
        TL --> STORE
        QL --> STORE
        STORE --> LS[(localStorage)]
    end
```

**Key architectural decisions:**

- **No framework**: Vanilla JS with ES6 module patterns (IIFE or plain functions) keeps the code portable and file://-compatible without a module bundler.
- **Single JS file**: All widget logic lives in `js/app.js`, separated by clearly commented sections.
- **Single CSS file**: All styles live in `css/style.css`, using CSS custom properties for theming (light/dark mode) and media queries for responsiveness.
- **ThemeManager**: A new component manages light/dark mode by toggling CSS classes on the root element and persisting the user's choice to localStorage.
- **StorageManager abstraction**: A thin wrapper around `localStorage` centralises error handling for quota-exceeded and parse errors, so individual widgets don't need to repeat try/catch logic.
- **Polling for the clock**: The Greeting_Widget uses `setInterval` (60-second interval) to update the time display. `Date` is read fresh on each tick to avoid drift.
- **Timer using `setInterval`**: The Focus_Timer uses a 1-second `setInterval` and re-reads `Date.now()` each tick to maintain accuracy even when the tab is backgrounded. Timer duration is now customizable and stored in localStorage.
- **Duplicate prevention**: TodoList validates new tasks against existing task text (case-insensitive, trimmed) before adding.
- **Task sorting**: TodoList supports multiple sort modes (creation date, alphabetical, completion status) stored in localStorage.
- **Immediate persistence**: All mutations (add, edit, delete, toggle, settings changes) trigger an immediate `save()` call to ensure data is persisted synchronously before the operation completes.
- **Graceful degradation**: If storage operations fail, the UI remains interactive and retains in-memory state, displaying warnings without blocking user actions.

---

## Components and Interfaces

### 0. ThemeManager

**Responsibility**: Manage light/dark mode theme toggle. Apply appropriate CSS class to document root. Persist user preference to localStorage.

```
ThemeManager
  - init()               → void    // loads saved theme, applies it, binds toggle control
  - toggle()             → void    // switches between 'light' and 'dark', saves preference
  - apply(theme)         → void    // sets 'data-theme' attribute on document root
  - save()               → void    // persists current theme to storage
  - load()               → void    // loads theme from storage, defaults to 'light'
  - getCurrentTheme()    → string  // returns 'light' or 'dark'
```

**State:**
- `currentTheme: string` — either 'light' or 'dark' (default: 'light')

**DOM structure:**
```html
<button id="theme-toggle" aria-label="Toggle theme">
  <span class="theme-icon">🌙</span>
</button>
```

**Behavior:**
- On load, reads `"todo-dashboard-theme"` from localStorage; defaults to `'light'` if absent
- Sets `data-theme="light"` or `data-theme="dark"` on `<html>` element
- CSS uses `[data-theme="dark"]` selectors to apply dark mode styles
- Toggle button icon changes: 🌙 (moon) for light mode, ☀️ (sun) for dark mode

---

### 1. GreetingWidget

**Responsibility**: Display current local time (HH:MM), full date, and contextual greeting with optional custom user name. Refresh time every 60 seconds. Allow user to set custom name.

```
GreetingWidget
  - init()           → void        // called once on page load; sets up DOM + interval + name input
  - render()         → void        // reads Date, updates DOM text nodes
  - getGreeting(h)   → string      // pure function: hour (0-23) → greeting string
  - setUserName(name)→ void        // validates and saves custom name to storage
  - getUserName()    → string      // loads custom name from storage, empty string if not set
  - renderGreeting() → void        // formats greeting with optional name
  - formatTime(d)    → string      // pure function: Date → "HH:MM"
  - formatDate(d)    → string      // pure function: Date → "Weekday, D Month YYYY"
  - validateName(name)→ boolean    // checks name is ≤50 chars
```

**State:**
- `userName: string` — custom name for greeting (default: empty string)

**DOM structure:**
```html
<section id="greeting-widget">
  <p id="greeting-text">Good Morning, John</p>
  <p id="time-display">08:42</p>
  <p id="date-display">Monday, 2 June 2025</p>
  <div class="name-settings">
    <input type="text" id="user-name-input" placeholder="Enter your name" maxlength="50" />
    <button id="save-name-btn">Save</button>
  </div>
</section>
```

**Behavior:**
- Greeting format: `"Good Morning"` (no name) or `"Good Morning, John"` (with name)
- User name is trimmed and limited to 50 characters
- Saved to localStorage under `"todo-dashboard-user-name"`
- Name is sanitized to prevent XSS (HTML-escaped before rendering)

---

### 2. FocusTimer

**Responsibility**: Manage a customizable Pomodoro countdown. Expose start/stop/reset controls and duration configuration. Play an audible beep and show a browser alert on completion.

```
FocusTimer
  - init()            → void    // called once; sets up DOM refs + loads saved duration
  - start()           → void    // begins interval if not already running
  - stop()            → void    // clears interval; preserves remaining seconds
  - reset()           → void    // clears interval; restores remaining to configured duration
  - tick()            → void    // decrements remaining; calls finish() at 0
  - finish()          → void    // stops timer, plays beep, shows alert
  - render()          → void    // formats remaining seconds → MM:SS and updates DOM
  - playBeep()        → void    // creates AudioContext tone ≥1 s
  - formatMMSS(s)     → string  // pure function: seconds → "MM:SS"
  - setDuration(mins) → void    // validates and saves custom duration (1-120 minutes)
  - getDuration()     → number  // loads duration from storage, defaults to 25
  - validateDuration(mins) → boolean // checks mins is integer in [1, 120]
```

**State:**
- `duration: number` — configured duration in minutes (default: 25, range: 1-120)
- `remaining: number` — seconds left (initial: duration * 60)
- `intervalId: number | null` — returned by `setInterval`

**DOM structure:**
```html
<section id="focus-timer">
  <p id="timer-display">25:00</p>
  <div class="timer-controls">
    <button id="timer-start">Start</button>
    <button id="timer-stop">Stop</button>
    <button id="timer-reset">Reset</button>
  </div>
  <div class="timer-settings">
    <label for="timer-duration-input">Duration (minutes):</label>
    <input type="number" id="timer-duration-input" min="1" max="120" value="25" />
    <button id="save-duration-btn">Save</button>
  </div>
</section>
```

**Behavior:**
- Duration is stored in localStorage under `"todo-dashboard-timer-duration"`
- Valid range: 1 to 120 minutes
- Invalid input displays inline error and retains previous valid value
- Reset restores timer to configured duration, not hardcoded 25 minutes
- Changing duration while timer is running does NOT affect current session; applies on next reset

---

### 3. TodoList

**Responsibility**: Manage a list of Task objects. Support add (with duplicate prevention), inline-edit, completion-toggle, delete, and sorting. Persist to localStorage on every mutation.

```
TodoList
  - init()                    → void    // loads from storage, renders, binds events
  - addTask(text)             → void    // validates (non-empty, ≤500 chars, not duplicate), creates Task, saves, re-renders
  - deleteTask(id)            → void    // removes Task from UI immediately, then attempts save
  - toggleComplete(id)        → void    // flips Task.completed, saves, re-renders
  - beginEdit(id)             → void    // swaps text span for input in place
  - confirmEdit(id, newText)  → void    // validates (non-empty, ≤500 chars, not duplicate if changed), updates Task.text, saves, re-renders
  - cancelEdit(id)            → void    // restores original text, no save
  - setSortMode(mode)         → void    // sets sort mode ('date'|'alpha'|'status'), saves, re-renders
  - getSortMode()             → string  // loads from storage, defaults to 'date'
  - sortTasks(tasks, mode)    → Task[] // pure function: sorts task array by mode
  - render()                  → void    // re-renders the full list from state after sorting
  - renderTask(task)          → HTMLElement
  - save()                    → void    // serializes tasks array → StorageManager
  - load()                    → void    // deserializes from StorageManager → tasks array
  - validateTaskText(text)    → boolean // checks non-empty and ≤500 chars
  - isDuplicate(text)         → boolean // checks if trimmed, case-insensitive text matches existing task
  - truncateText(text)        → string  // truncates to 500 chars if needed
```

**State:**
- `tasks: Task[]` — array of task objects
- `sortMode: string` — current sort mode: 'date' (default), 'alpha', or 'status'

**DOM structure (per task item):**
```html
<li class="task-item" data-id="{id}">
  <input type="checkbox" class="task-toggle" />
  <span class="task-text">Buy milk</span>
  <button class="task-edit">Edit</button>
  <button class="task-delete">Delete</button>
</li>
```

**DOM structure (sort controls):**
```html
<div class="todo-sort-controls">
  <label for="sort-select">Sort by:</label>
  <select id="sort-select">
    <option value="date">Date Added</option>
    <option value="alpha">Alphabetical</option>
    <option value="status">Completion Status</option>
  </select>
</div>
```

**Behavior notes:**
- `addTask(text)`: Checks for duplicates using case-insensitive, trimmed comparison. If duplicate found, displays inline error "Task already exists" and rejects addition.
- `confirmEdit(id, newText)`: If new text is a duplicate of a different task, displays inline error and rejects edit.
- `sortTasks()` sorting rules:
  - **'date'**: Sort by `createdAt` timestamp (newest first)
  - **'alpha'**: Sort alphabetically by `text` (case-insensitive)
  - **'status'**: Incomplete tasks first, then completed tasks; within each group, sort by `createdAt`
- Sort mode persisted to localStorage under `"todo-dashboard-sort-mode"`
- `deleteTask(id)`: Removes task from UI immediately, then calls `save()`. If save fails, task remains removed from UI and error is displayed (Req 3.11, 3.14).
- `addTask(text)`: If text exceeds 500 characters, it is truncated to exactly 500 characters before creating the Task (Req 3.13).
- `confirmEdit(id, "")`: Empty or whitespace-only text is rejected; original text is restored (Req 3.8).
- `save()` failure: Displays inline error message without blocking UI; in-memory state is preserved (Req 3.14).

---

### 4. QuickLinks

**Responsibility**: Manage a list of Link objects. Support add (with validation) and delete. Open links in new tabs. Persist to localStorage on every mutation.

```
QuickLinks
  - init()                  → void    // loads from storage, renders, binds events
  - addLink(label, url)     → void    // validates, creates Link, saves, re-renders
  - deleteLink(id)          → void    // saves to storage, then removes Link from UI
  - openLink(url)           → void    // window.open(url, '_blank')
  - render()                → void    // re-renders link buttons from state
  - renderLink(link)        → HTMLElement
  - validate(label, url)    → { labelError, urlError } | null
  - save()                  → void    // serializes links array → StorageManager
  - load()                  → void    // deserializes from StorageManager → links array
```

**Behavior notes:**
- `validate(label, url)`: Returns error objects if label is empty/exceeds 100 chars or URL is empty/doesn't start with `http://` or `https://` (Req 4.2, 4.3, 4.4).
- `addLink(label, url)`: If validation passes, saves to storage first, then adds button to UI. If save fails, button is still added and warning is shown (Req 4.5).
- `deleteLink(id)`: Saves to storage, then removes from UI (Req 4.8).
- `load()` on corrupted data: Initializes with empty collection (Req 4.10).

---

### 5. StorageManager

**Responsibility**: Thin wrapper around `localStorage`. Provides JSON serialization/deserialization with error handling for parse failures and quota exceeded.

```
StorageManager
  - save(key, data)   → { ok: boolean, error?: string }
  - load(key)         → { ok: boolean, data?: any, error?: string }
```

**Behaviour:**
- `save`: calls `JSON.stringify` + `localStorage.setItem`. Catches `QuotaExceededError` and generic errors; returns `{ ok: false, error }`.
- `load`: calls `localStorage.getItem` + `JSON.parse`. Returns `{ ok: true, data }` on success; `{ ok: false }` on missing key or parse error.

---

## Data Models

### Theme Settings

**localStorage key**: `"todo-dashboard-theme"`
**Stored format**: String literal `"light"` or `"dark"`

Example:
```json
"dark"
```

---

### User Name

**localStorage key**: `"todo-dashboard-user-name"`
**Stored format**: String (0-50 characters, trimmed)

Example:
```json
"John"
```

---

### Timer Duration

**localStorage key**: `"todo-dashboard-timer-duration"`
**Stored format**: Number (integer, 1-120 minutes)

Example:
```json
25
```

---

### Task Sort Mode

**localStorage key**: `"todo-dashboard-sort-mode"`
**Stored format**: String literal `"date"`, `"alpha"`, or `"status"`

Example:
```json
"date"
```

---

### Task

```js
/**
 * @typedef {Object} Task
 * @property {string} id          - Unique ID, generated via Date.now() + random suffix
 * @property {string} text        - Task description, 1–500 characters
 * @property {boolean} completed  - Completion state
 * @property {number} createdAt   - Unix timestamp (ms) of creation
 */
```

**localStorage key**: `"todo-dashboard-tasks"`
**Stored format**: JSON array of Task objects

Example:
```json
[
  { "id": "1717305600123-abc", "text": "Buy milk", "completed": false, "createdAt": 1717305600123 },
  { "id": "1717305700456-def", "text": "Write report", "completed": true, "createdAt": 1717305700456 }
]
```

---

### Link

```js
/**
 * @typedef {Object} Link
 * @property {string} id       - Unique ID, generated via Date.now() + random suffix
 * @property {string} label    - Button label, 1–100 characters
 * @property {string} url      - Full URL starting with http:// or https://
 * @property {number} createdAt - Unix timestamp (ms) of creation
 */
```

**localStorage key**: `"todo-dashboard-links"`
**Stored format**: JSON array of Link objects

Example:
```json
[
  { "id": "1717305800789-ghi", "label": "GitHub", "url": "https://github.com", "createdAt": 1717305800789 },
  { "id": "1717305900012-jkl", "label": "MDN", "url": "https://developer.mozilla.org", "createdAt": 1717305900012 }
]
```

---

### ID Generation

```js
function generateId() {
  return Date.now() + '-' + Math.random().toString(36).slice(2, 7);
}
```

---

## Correctness Properties


*A property is a characteristic or behavior that should hold true across all valid executions of a system — essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

---

### Property 1: Greeting is correct for all hours of the day

*For any* integer hour h in the range [0, 23], `getGreeting(h)` SHALL return exactly:
- `"Good Morning"` when h ∈ [5, 11]
- `"Good Afternoon"` when h ∈ [12, 17]
- `"Good Evening"` when h ∈ [18, 20]
- `"Good Night"` when h ∈ [0, 4] ∪ [21, 23]

and no other string shall ever be returned for a valid hour.

**Validates: Requirements 1.3, 1.4, 1.5, 1.6**

---

### Property 2: Time formatting is always valid HH:MM

*For any* `Date` object with any hour (0–23) and minute (0–59), `formatTime(date)` SHALL return a string that:
- matches the pattern `HH:MM` (two digits, colon, two digits)
- has the correct hour value (zero-padded to 2 digits)
- has the correct minute value (zero-padded to 2 digits)

**Validates: Requirements 1.1**

---

### Property 3: Date formatting produces correct components

*For any* `Date` object, `formatDate(date)` SHALL return a string whose components correctly reflect the weekday name, day of month, full month name, and four-digit year of the input date.

**Validates: Requirements 1.2**

---

### Property 4: Timer reset always produces 25:00

*For any* Focus_Timer state (any value of `remaining` between 0 and 1500, whether running or stopped), calling `reset()` SHALL result in `remaining === 1500` and the timer SHALL NOT be running.

**Validates: Requirements 2.4**

---

### Property 5: Timer formatting is always valid MM:SS

*For any* integer number of seconds `s` in the range [0, 1500], `formatMMSS(s)` SHALL return a string that:
- matches the pattern `MM:SS` (two digits, colon, two digits)
- has the correct quotient (minutes) and remainder (seconds) for `s`

**Validates: Requirements 2.6**

---

### Property 6: Start is idempotent — double-start does not corrupt state

*For any* Focus_Timer state, calling `start()` twice in succession SHALL produce the same `remaining` value and running state as calling `start()` once. The interval SHALL NOT be duplicated.

**Validates: Requirements 2.7**

---

### Property 7: Adding a valid task persists it to storage

*For any* non-empty task text of at most 500 characters and any existing task list, calling `addTask(text)` SHALL:
1. Increase the task list length by exactly 1
2. Include the new task in the collection returned by `StorageManager.load("todo-dashboard-tasks")`

**Validates: Requirements 3.1, 3.3, 5.2, 5.3**

---

### Property 8: Adding an empty or whitespace-only task is rejected

*For any* string composed entirely of whitespace characters (including the empty string), calling `addTask(text)` SHALL NOT increase the task list length and SHALL NOT write the invalid task to storage.

**Validates: Requirements 3.2**

---

### Property 9: Task completion toggle is a round-trip

*For any* task with any initial `completed` state, calling `toggleComplete(id)` twice SHALL restore `completed` to its original value, and storage SHALL reflect each intermediate and final state correctly.

**Validates: Requirements 3.4, 3.5**

---

### Property 10: Confirming a valid inline edit persists the new text

*For any* task and any valid non-empty replacement text of at most 500 characters, calling `confirmEdit(id, newText)` SHALL update `task.text` to `newText` and the stored collection SHALL reflect the updated text.

**Validates: Requirements 3.7**

---

### Property 11: Confirming an empty inline edit is rejected

*For any* task with original text T, calling `confirmEdit(id, emptyOrWhitespace)` SHALL leave `task.text` unchanged as T and SHALL NOT overwrite storage with an empty task text.

**Validates: Requirements 3.8**

---

### Property 12: Cancelling an inline edit restores original text without saving

*For any* task with original text T that is in edit mode, calling `cancelEdit(id)` SHALL restore the displayed text to T, and the stored collection SHALL remain identical to its state before edit mode was entered.

**Validates: Requirements 3.9**

---

### Property 13: Task deletion removes the task from storage (Tasks round-trip)

*For any* task collection C saved to storage under `"todo-dashboard-tasks"`, after deleting a task with id X, loading from storage SHALL return a collection that does not contain any task with id X, and all other tasks in C SHALL be preserved intact.

**Validates: Requirements 3.11, 3.12, 5.2**

---

### Property 14: Task text is bounded at 500 characters

*For any* string with length greater than 500 characters, the stored task text after `addTask` SHALL have `length ≤ 500`.

**Validates: Requirements 3.13**

---

### Property 15: Quick Links validation correctly classifies all label/URL combinations

*For any* label string and any URL string, `validate(label, url)` SHALL return:
- a label error when the label is empty or exceeds 100 characters
- a URL error when the URL is empty or does not begin with `"http://"` or `"https://"`
- `null` (no errors) when both label and URL satisfy their constraints

**Validates: Requirements 4.2, 4.3, 4.4**

---

### Property 16: Quick Links storage round-trip preserves all links

*For any* links collection C saved to storage under `"todo-dashboard-links"`, after adding a link with valid label and URL:
- the link SHALL appear in the collection returned by `StorageManager.load("todo-dashboard-links")`
- after deleting a link with id X, that id SHALL no longer appear in the loaded collection
- all other links in C SHALL be preserved intact

**Validates: Requirements 4.5, 4.8, 4.9, 5.2**

---

### Property 17: StorageManager round-trip preserves any serializable value

*For any* JavaScript value that is JSON-serializable (object, array, string, number, boolean, null), calling `StorageManager.save(key, value)` followed by `StorageManager.load(key)` SHALL return `{ ok: true, data }` where `data` is deeply equal to the original value.

**Validates: Requirements 5.5**

---

### Property 18: Theme persistence round-trip

*For any* valid theme value ('light' or 'dark'), calling `ThemeManager.save()` after setting the theme followed by `ThemeManager.load()` SHALL restore the same theme value.

**Validates: Requirements 7.1**

---

### Property 19: Theme application sets correct DOM attribute

*For any* valid theme value ('light' or 'dark'), calling `ThemeManager.apply(theme)` SHALL set the `data-theme` attribute on the document root element to exactly that theme value.

**Validates: Requirements 7.1**

---

### Property 20: Theme toggle is a round-trip

*For any* starting theme ('light' or 'dark'), calling `ThemeManager.toggle()` twice SHALL restore the theme to its original value, and storage SHALL reflect each intermediate and final state correctly.

**Validates: Requirements 7.1**

---

### Property 21: User name validation correctly classifies all inputs

*For any* string input, `GreetingWidget.validateName(name)` SHALL return `true` if and only if the trimmed string length is in the range [0, 50], and `false` otherwise.

**Validates: Requirements 7.2**

---

### Property 22: User name persistence round-trip

*For any* valid name string (≤50 characters), calling `GreetingWidget.setUserName(name)` followed by `GreetingWidget.getUserName()` SHALL return the trimmed version of the original name.

**Validates: Requirements 7.2**

---

### Property 23: User name is HTML-escaped for XSS prevention

*For any* name string containing HTML special characters (`<`, `>`, `&`, `"`, `'`), the rendered greeting SHALL display these characters as escaped entities, not as HTML markup.

**Validates: Requirements 7.2**

---

### Property 24: Greeting format includes name when set

*For any* valid name string and any hour h in [0, 23], when a custom name is set, `GreetingWidget.renderGreeting()` SHALL produce a greeting that includes the name in the format `"{greeting}, {name}"`, and when no name is set, SHALL produce only `"{greeting}"`.

**Validates: Requirements 7.2**

---

### Property 25: Timer duration validation correctly classifies all inputs

*For any* integer input, `FocusTimer.validateDuration(mins)` SHALL return `true` if and only if the value is in the range [1, 120], and `false` otherwise.

**Validates: Requirements 7.3**

---

### Property 26: Timer duration persistence round-trip

*For any* valid duration value in [1, 120] minutes, calling `FocusTimer.setDuration(mins)` followed by `FocusTimer.getDuration()` SHALL return the same value.

**Validates: Requirements 7.3**

---

### Property 27: Timer reset uses configured duration

*For any* valid duration D in [1, 120] minutes, after calling `FocusTimer.setDuration(D)` followed by `FocusTimer.reset()`, the `remaining` value SHALL equal exactly `D * 60` seconds.

**Validates: Requirements 7.3, 2.4**

---

### Property 28: Duplicate task rejection on add

*For any* existing task text T in the task list, calling `TodoList.addTask(duplicate)` where `duplicate` is any string that matches T when both are trimmed and compared case-insensitively SHALL NOT increase the task list length and SHALL NOT modify storage.

**Validates: Requirements 7.4**

---

### Property 29: Duplicate task rejection on edit

*For any* two tasks A and B with different text, calling `TodoList.confirmEdit(A.id, B.text)` SHALL reject the edit, leaving A.text unchanged, and SHALL NOT modify storage.

**Validates: Requirements 7.4**

---

### Property 30: Sort mode persistence round-trip

*For any* valid sort mode ('date', 'alpha', or 'status'), calling `TodoList.setSortMode(mode)` followed by `TodoList.getSortMode()` SHALL return the same mode value.

**Validates: Requirements 7.5**

---

### Property 31: Date sort produces descending timestamp order

*For any* task array, calling `TodoList.sortTasks(tasks, 'date')` SHALL return an array ordered by `createdAt` timestamp in descending order (newest first), and SHALL preserve all task objects intact.

**Validates: Requirements 7.5**

---

### Property 32: Alphabetical sort produces case-insensitive lexicographic order

*For any* task array, calling `TodoList.sortTasks(tasks, 'alpha')` SHALL return an array ordered by `text` field in case-insensitive lexicographic order, and SHALL preserve all task objects intact.

**Validates: Requirements 7.5**

---

### Property 33: Status sort groups incomplete before completed

*For any* task array, calling `TodoList.sortTasks(tasks, 'status')` SHALL return an array where all tasks with `completed === false` appear before all tasks with `completed === true`, and within each group, tasks SHALL be ordered by `createdAt` in descending order.

**Validates: Requirements 7.5**

---

## Error Handling

### StorageManager errors

| Scenario | Handling |
|---|---|
| `localStorage` write quota exceeded | `save()` returns `{ ok: false, error: "QuotaExceeded" }`; caller displays a non-blocking warning banner |
| `localStorage.setItem` throws (security/access) | `save()` catches and returns `{ ok: false, error: "AccessDenied" }` |
| `localStorage.getItem` returns `null` (key absent) | `load()` returns `{ ok: false }` — caller initializes empty collection |
| `JSON.parse` throws on corrupted data | `load()` catches and returns `{ ok: false }` — caller initializes empty collection |

### ThemeManager errors

| Scenario | Handling |
|---|---|
| `load()` returns invalid theme value | Defaults to `'light'` theme |
| `save()` returns `ok: false` | Non-blocking warning displayed; theme still applied to UI |

### GreetingWidget errors

| Scenario | Handling |
|---|---|
| `setUserName()` with name > 50 chars | Inline error shown; previous name retained |
| Name contains HTML/script tags | Name is HTML-escaped before rendering; XSS prevented |
| `getUserName()` load fails | Returns empty string; greeting shown without name |

### TodoList errors

| Scenario | Handling |
|---|---|
| `addTask("")` or `addTask("  ")` | Silently ignored; input field retains focus |
| `addTask()` with duplicate text | Inline error "Task already exists" shown; task not added |
| `confirmEdit(id, "")` | Edit cancelled; original text restored |
| `confirmEdit(id, duplicateText)` | Inline error "Task already exists" shown; edit rejected |
| Invalid sort mode in storage | Defaults to `'date'` sort mode |
| `save()` returns `ok: false` | Inline error message shown below the list; in-memory state preserved |
| `load()` returns `ok: false` | `tasks` array initialized to `[]`; app renders normally |

### QuickLinks errors

| Scenario | Handling |
|---|---|
| Invalid label (empty or > 100 chars) | Inline error shown on label input field |
| Invalid URL (empty or not http/https) | Inline error shown on URL input field |
| `save()` returns `ok: false` | Non-blocking warning message displayed |
| `load()` returns `ok: false` | `links` array initialized to `[]`; app renders normally |

### FocusTimer errors

| Scenario | Handling |
|---|---|
| `setDuration()` with invalid value (< 1 or > 120) | Inline error shown; previous duration retained |
| `getDuration()` load fails or invalid | Defaults to 25 minutes |
| `AudioContext` not supported | `playBeep()` silently skips audio; browser alert still fires |
| `start()` called while running | No-op; existing interval preserved |
| `stop()` called while not running | No-op; `remaining` unchanged |

---

## Testing Strategy

### Overview

This project uses a dual testing approach: **unit/example-based tests** for specific behaviors and error conditions, and **property-based tests** for universal correctness guarantees.

**Property-Based Testing Library**: [fast-check](https://fast-check.io/) (JavaScript, browser and Node compatible). Since the application is pure Vanilla JS with no build step, tests will be run via Node.js using `fast-check` and a lightweight test runner (e.g., `node:test` built-in or Vitest).

Each property test is configured to run a minimum of **100 iterations** to exercise the input space.

---

### Unit / Example-Based Tests

These cover specific scenarios, edge cases, and integration points:

- `ThemeManager.init()` → defaults to 'light' theme if not set
- `ThemeManager.toggle()` from 'light' → 'dark', toggle again → 'light'
- `GreetingWidget.setUserName("John")` → greeting includes "John"
- `GreetingWidget.setUserName("")` → greeting has no name
- `GreetingWidget.setUserName()` with > 50 chars → validation fails
- `GreetingWidget` with name containing `<script>` → HTML escaped
- `FocusTimer.init()` → `remaining === 1500`, display shows "25:00"
- `FocusTimer.setDuration(30)` → `getDuration() === 30`
- `FocusTimer.setDuration(0)` → validation fails, previous duration retained
- `FocusTimer.setDuration(121)` → validation fails
- `FocusTimer.start()` + N manual `tick()` calls → `remaining === 1500 - N`
- `FocusTimer.stop()` → countdown pauses; `remaining` unchanged after pause
- `FocusTimer.tick()` when `remaining === 1` → `finish()` called, timer stopped
- `FocusTimer.stop()` when not running → no-op
- `TodoList.addTask("Buy milk")` then `addTask("buy milk")` → second rejected as duplicate
- `TodoList.addTask("Task 1")` then edit to "Task 1" → edit rejected
- `TodoList.addTask("")` → list length unchanged
- `TodoList.confirmEdit(id, "")` → task text unchanged
- `TodoList.setSortMode('alpha')` → tasks sorted alphabetically
- `TodoList.setSortMode('status')` → incomplete tasks before completed tasks
- `StorageManager.load(key)` on missing key → `{ ok: false }`
- `StorageManager.load(key)` on corrupted JSON → `{ ok: false }`
- `TodoList.load()` when storage fails → `tasks === []`
- `QuickLinks.load()` when storage fails → `links === []`
- `StorageManager.save()` when quota exceeded (mock) → `{ ok: false, error: "QuotaExceeded" }`
- Each task item has edit and delete buttons present in DOM
- Each link item has a delete button and a labelled anchor/button
- `QuickLinks.openLink(url)` calls `window.open(url, '_blank')`

---

### Property-Based Tests

Each test is tagged with the format:
**`Feature: todo-life-dashboard, Property {N}: {property_text}`**

| # | Property | Test Description |
|---|---|---|
| 1 | Greeting correct for all hours | Generate `h` in [0,23]; assert `getGreeting(h)` matches expected mapping |
| 2 | Time formatting always HH:MM | Generate random `Date`; assert `formatTime(d)` matches `\d{2}:\d{2}` and values are correct |
| 3 | Date formatting correct components | Generate random `Date`; assert `formatDate(d)` contains correct weekday, day, month name, year |
| 4 | Timer reset always 25:00 | Generate any `remaining` in [0,1500]; call `reset()`; assert `remaining === 1500` |
| 5 | MM:SS formatting always valid | Generate `s` in [0,1500]; assert `formatMMSS(s)` matches `\d{2}:\d{2}` with correct values |
| 6 | Start is idempotent | Generate timer state; call `start()` twice; assert same effect as once |
| 7 | Adding valid task persists it | Generate non-empty text ≤500 chars; addTask; assert list grows by 1 and storage contains task |
| 8 | Empty/whitespace task rejected | Generate whitespace-only strings; addTask; assert list unchanged |
| 9 | Toggle completion is round-trip | Generate task with any completed state; toggle twice; assert restored |
| 10 | confirmEdit persists valid text | Generate task + valid new text; confirmEdit; assert text updated in memory and storage |
| 11 | confirmEdit rejects empty text | Generate task + empty/whitespace text; confirmEdit; assert text unchanged |
| 12 | cancelEdit restores text | Generate task + edited text; cancelEdit; assert original text restored; storage unchanged |
| 13 | deleteTask removes from storage | Generate task collection; deleteTask(id); assert id absent from storage, others intact |
| 14 | Text bounded at 500 chars | Generate strings >500 chars; addTask; assert stored text length ≤ 500 |
| 15 | validate classifies all combos | Generate (label, url) pairs; assert validate() returns errors iff constraints violated |
| 16 | QuickLinks storage round-trip | Generate links collection; add + delete; assert storage reflects each operation correctly |
| 17 | StorageManager round-trip | Generate any JSON-serializable value; save + load; assert deep equality |
| 18 | Theme persistence round-trip | Generate theme value ('light'/'dark'); save + load; assert same value restored |
| 19 | Theme application sets DOM attribute | Generate theme value; call apply(); assert data-theme attribute matches |
| 20 | Theme toggle is round-trip | Generate starting theme; toggle twice; assert original theme restored |
| 21 | Name validation classifies inputs | Generate strings of various lengths; assert validation returns true iff length ≤ 50 |
| 22 | Name persistence round-trip | Generate valid name; setUserName + getUserName; assert trimmed name returned |
| 23 | Name HTML-escaped for XSS | Generate names with HTML chars (`<>&"'`); assert rendered output contains escaped entities |
| 24 | Greeting includes name when set | Generate valid name + hour; assert greeting format includes name iff name is set |
| 25 | Duration validation classifies inputs | Generate integers; assert validation returns true iff value in [1, 120] |
| 26 | Duration persistence round-trip | Generate valid duration; setDuration + getDuration; assert same value returned |
| 27 | Reset uses configured duration | Generate duration D; setDuration(D) + reset(); assert remaining === D * 60 |
| 28 | Duplicate task rejection on add | Generate existing task text; attempt to add case-insensitive variant; assert list unchanged |
| 29 | Duplicate task rejection on edit | Generate two tasks; attempt to edit one to match other; assert edit rejected, text unchanged |
| 30 | Sort mode persistence round-trip | Generate sort mode; setSortMode + getSortMode; assert same mode returned |
| 31 | Date sort descending order | Generate task array; sortTasks with mode='date'; assert descending createdAt order |
| 32 | Alpha sort lexicographic order | Generate task array; sortTasks with mode='alpha'; assert case-insensitive alphabetical order |
| 33 | Status sort groups incomplete first | Generate task array; sortTasks with mode='status'; assert incomplete before completed, each group by createdAt descending |

---

### Test Configuration

```js
// Example property test setup (fast-check + node:test)
// Feature: todo-life-dashboard, Property 1: Greeting correct for all hours

import fc from 'fast-check';
import { test } from 'node:test';
import assert from 'node:assert';
import { getGreeting } from '../js/app.js';

test('Property 1: getGreeting returns correct string for all hours', () => {
  fc.assert(
    fc.property(
      fc.integer({ min: 0, max: 23 }),
      (h) => {
        const greeting = getGreeting(h);
        if (h >= 5 && h < 12)  return greeting === 'Good Morning';
        if (h >= 12 && h < 18) return greeting === 'Good Afternoon';
        if (h >= 18 && h < 21) return greeting === 'Good Evening';
        return greeting === 'Good Night'; // [0,4] and [21,23]
      }
    ),
    { numRuns: 100 }
  );
});
```

---

### Coverage Targets

- All 33 correctness properties covered by property-based tests
- All error paths (StorageManager failures, validation rejections, duplicate detection) covered by unit tests
- All four widgets and ThemeManager have at least one integration smoke test verifying render in a headless browser (JSDOM)

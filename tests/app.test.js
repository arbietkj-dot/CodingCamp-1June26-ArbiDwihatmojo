// tests/app.test.js — Todo Life Dashboard tests
// Uses fast-check for property-based testing and node:test as the test runner.
// Run with: node --test tests/app.test.js

const fc = require('fast-check');
const { test } = require('node:test');
const assert = require('node:assert');

// =============================================================================
// localStorage mock for Node.js environment
// =============================================================================
class LocalStorageMock {
  constructor() {
    this.store = {};
  }

  clear() {
    this.store = {};
  }

  getItem(key) {
    return Object.prototype.hasOwnProperty.call(this.store, key)
      ? this.store[key]
      : null;
  }

  setItem(key, value) {
    this.store[key] = String(value);
  }

  removeItem(key) {
    delete this.store[key];
  }

  get length() {
    return Object.keys(this.store).length;
  }

  key(index) {
    const keys = Object.keys(this.store);
    return keys[index] || null;
  }
}

// Set up global localStorage for Node.js before importing app.js
global.localStorage = new LocalStorageMock();
global.document = null; // Prevent DOM access errors on load
global.window = global;
global.alert = () => {};
global.setInterval = setInterval;
global.clearInterval = clearInterval;

const { StorageManager } = require('../js/app.js');

// =============================================================================
// Placeholder test
// =============================================================================

test('placeholder: test suite is runnable', () => {
  assert.ok(true);
});

// =============================================================================
// Task 2.3: Unit tests for StorageManager error paths
// Requirements: 5.4, 5.6
// =============================================================================

test('StorageManager.load() on missing key returns { ok: false }', () => {
  // Arrange: ensure key does not exist
  const testKey = 'test-missing-key-' + Date.now();
  global.localStorage.removeItem(testKey);

  // Act
  const result = StorageManager.load(testKey);

  // Assert
  assert.strictEqual(result.ok, false, 'ok should be false for a missing key');
  assert.strictEqual(result.data, undefined, 'data should not be present');
});

test('StorageManager.load() on corrupted JSON returns { ok: false }', () => {
  // Arrange: set invalid JSON in localStorage
  const testKey = 'test-corrupted-json-' + Date.now();
  global.localStorage.setItem(testKey, '{this is not valid JSON}');

  // Act
  const result = StorageManager.load(testKey);

  // Assert
  assert.strictEqual(result.ok, false, 'ok should be false for corrupted JSON');
  assert.strictEqual(result.data, undefined, 'data should not be present');

  // Cleanup
  global.localStorage.removeItem(testKey);
});

test('StorageManager.save() when quota exceeded returns { ok: false, error: "QuotaExceeded" }', () => {
  // Arrange: mock localStorage.setItem to throw a DOMException with
  // the "QuotaExceededError" name, simulating a browser storage quota error.
  const testKey = 'test-quota-exceeded-' + Date.now();
  const originalSetItem = global.localStorage.setItem.bind(global.localStorage);

  global.localStorage.setItem = function (key, value) {
    if (key === testKey) {
      // DOMException is available globally in Node.js v16+.
      // "QuotaExceededError" is the standard DOM name for quota errors.
      throw new DOMException('The quota has been exceeded.', 'QuotaExceededError');
    }
    return originalSetItem(key, value);
  };

  try {
    // Act
    const result = StorageManager.save(testKey, { some: 'data' });

    // Assert
    assert.strictEqual(result.ok, false, 'ok should be false when quota exceeded');
    assert.strictEqual(result.error, 'QuotaExceeded', 'error should be "QuotaExceeded"');
  } finally {
    // Cleanup: restore original localStorage.setItem
    global.localStorage.setItem = originalSetItem;
  }
});

// =============================================================================
// Task 2.2: Property test for StorageManager round-trip (Property 17)
// **Validates: Requirements 5.5**
// =============================================================================

test('Property 17: StorageManager round-trip preserves any serializable value', () => {
  fc.assert(
    fc.property(
      fc.jsonValue(), // Generate any JSON-serializable value (object, array, string, number, boolean, null)
      (value) => {
        // Arrange: generate a unique test key
        const testKey = 'test-roundtrip-' + Date.now() + '-' + Math.random();

        // Act: save the value, then load it back
        const saveResult = StorageManager.save(testKey, value);
        const loadResult = StorageManager.load(testKey);

        // Assert: save should succeed
        assert.strictEqual(saveResult.ok, true, 'save() should return ok: true');

        // Assert: load should succeed
        assert.strictEqual(loadResult.ok, true, 'load() should return ok: true');

        // Assert: loaded data should be deeply equal to original value
        assert.deepStrictEqual(
          loadResult.data,
          value,
          'loaded data should be deeply equal to original value'
        );

        // Cleanup
        global.localStorage.removeItem(testKey);
      }
    ),
    { numRuns: 100 } // Run 100 iterations with different generated values
  );
});

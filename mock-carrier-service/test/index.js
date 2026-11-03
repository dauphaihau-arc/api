/**
 * Directory entry point for `node --test mock-carrier-service/test`.
 *
 * Node 24 treats a positional directory as a module path instead of a test
 * directory, so this module imports every test file. Running the runner with an
 * explicit glob (`node --test 'mock-carrier-service/test/*.test.mjs'`) skips this file.
 */
import './registration.test.mjs';
import './handover.test.mjs';
import './advance.test.mjs';
import './timers.test.mjs';
import './errors.test.mjs';
import './rates.test.mjs';
import './labels.test.mjs';

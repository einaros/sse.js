const locks = {};

function Lock() {
  this.taken = false;
  this.waitList = [];
}

function _execWithLockOnResource(id, cb) {
  if (!locks.hasOwnProperty(id)) {
    locks[id] = new Lock();
  }
  
  const lock = locks[id];
  if (lock.taken) {
    lock.waitList.push(cb);
  } else {
    lock.taken = true;
    process.nextTick(cb);
  }
}

function _releaseLock(id) {
  if (!locks.hasOwnProperty(id)) return;
  
  const lock = locks[id];
  if (!lock.taken) return;
  
  const waitList = lock.waitList;
  if (waitList.length === 0) {
    lock.taken = false;
    return;
  }
  
  process.nextTick(waitList.shift());
}

// --------------------------

/**
 * Will execute <cb> when no other function is working on the same resource's <id>
 * @param id
 *     The resource id to lock
 * @param cb
 *     The callback to execute when the lock is available
 */
exports.execWithLockOnResource = function (id, cb) {
  _execWithLockOnResource(id, cb);
};

/**
 * Releases the lock on a resource's <id>, making it available for other methods
 * @param id
 *     The resource id to unlock
 */
exports.releaseLock = function (id) {
  _releaseLock(id);
};
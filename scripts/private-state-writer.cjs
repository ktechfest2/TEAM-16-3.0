const { ftruncateSync, fsyncSync, writeSync } = require("node:fs");

function persistJsonState(fileDescriptor, state) {
  const payload = Buffer.from(`${JSON.stringify(state, null, 2)}\n`, "utf8");
  let offset = 0;
  while (offset < payload.length) {
    const written = writeSync(fileDescriptor, payload, offset, payload.length - offset, offset);
    if (written < 1) throw new Error("Private credential state could not be written");
    offset += written;
  }
  ftruncateSync(fileDescriptor, payload.length);
  fsyncSync(fileDescriptor);
}

module.exports = { persistJsonState };

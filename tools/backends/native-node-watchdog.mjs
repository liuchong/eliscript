import {parentPort, workerData} from 'node:worker_threads';

// The loader can be inside a synchronous native frame when its Node owner is
// terminated. A separate thread can still observe that owner disappearing and
// terminate this loader process; it never signals another development process.
const owner = workerData?.parentPID;
if (!Number.isSafeInteger(owner) || owner < 1) throw new TypeError('native loader requires its owning process identity');
function checkOwner() {
  try {process.kill(owner, 0);}
  catch (error) {
    if (error?.code === 'EPERM') return;
    if (error?.code !== 'ESRCH') throw error;
    process.kill(process.pid, 'SIGTERM');
  }
}
checkOwner();
const timer = setInterval(checkOwner, 250);
parentPort.once('close', () => clearInterval(timer));
parentPort.postMessage({ready: true});

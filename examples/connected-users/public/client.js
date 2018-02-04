const connectionStatusEl = document.getElementById('connectionStatus');
const nrUsersEl = document.getElementById('nrUsers');

const eventSource = new EventSource('/sse');

eventSource.onerror = () => {
  connectionStatusEl.className = 'out-of-sync';
  nrUsersEl.className = 'out-of-sync';
  connectionStatusEl.innerText = 'disconnected';
};

eventSource.onopen = () => {
  connectionStatusEl.className = 'in-sync';
  nrUsersEl.className = 'in-sync';
  connectionStatusEl.innerText = 'connected';
};

eventSource.addEventListener('nrUsers', e => {
  nrUsersEl.innerText = e.data;
});
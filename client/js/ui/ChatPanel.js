/**
 * ChatPanel — manages in-meeting text chat DOM elements.
 */
const ChatPanel = (() => {
  function init() {
    document.getElementById('btn-chat-send').onclick = _sendMessage;
    document.getElementById('chat-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); _sendMessage(); }
    });
  }

  function _sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;
    SocketManager.sendChatMessage(text);
    input.value = '';
  }

  function addMessage(senderId, senderName, senderColor, text) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `
      <span class="msg-name" style="color:${senderColor}">${escapeHtml(senderName)}: </span>
      <span class="msg-text">${escapeHtml(text)}</span>
    `;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function addSystem(text) {
    const container = document.getElementById('chat-messages');
    const div = document.createElement('div');
    div.className = 'chat-msg';
    div.innerHTML = `<span style="color:#5566aa;font-style:italic">${escapeHtml(text)}</span>`;
    container.appendChild(div);
    container.scrollTop = container.scrollHeight;
  }

  function clear() {
    document.getElementById('chat-messages').innerHTML = '';
    document.getElementById('chat-input').value = '';
  }

  function setEnabled(enabled) {
    document.getElementById('chat-input').disabled = !enabled;
    document.getElementById('btn-chat-send').disabled = !enabled;
  }

  return { init, addMessage, addSystem, clear, setEnabled };
})();

/**
 * HUD — manages all the heads-up display DOM elements during gameplay.
 */
const HUD = (() => {
  let _role = null;
  let _killCdInterval = null;
  let _meetingCooldownEnd = 0;
  let _killCooldownEnd = 0;
  let _onMeeting = null;
  let _onKill = null;
  let _onSabotage = null;
  let _actionHintTimeout = null;

  function show(role) {
    _role = role;
    document.getElementById('hud').classList.remove('hidden');

    const roleEl = document.getElementById('hud-role');
    if (role === 'virus') {
      roleEl.textContent = 'MALWARE';
      roleEl.className = 'hud-role virus';
      document.getElementById('hud-kill-cooldown').classList.remove('hidden');
      document.getElementById('hud-sabotage-btns').classList.remove('hidden');
    } else if (role === 'antivirus') {
      roleEl.textContent = 'SYSTEM PROCESS';
      roleEl.className = 'hud-role antivirus';
    } else {
      roleEl.textContent = 'GHOST';
      roleEl.className = 'hud-role ghost';
    }

    _setupButtons(role);
    _startCooldownLoop();
  }

  function hide() {
    document.getElementById('hud').classList.add('hidden');
    clearInterval(_killCdInterval);
  }

  function setDead() {
    _role = 'ghost';
    const roleEl = document.getElementById('hud-role');
    roleEl.textContent = 'GHOST';
    roleEl.className = 'hud-role ghost';
    document.getElementById('hud-kill-cooldown').classList.add('hidden');
    document.getElementById('hud-sabotage-btns').classList.add('hidden');
    document.getElementById('btn-meeting').disabled = true;
  }

  function updateTaskProgress(pct) {
    document.getElementById('hud-task-bar-fill').style.width = `${pct}%`;
    document.getElementById('hud-task-pct').textContent = `${pct}%`;
  }

  function setKillCooldown(endTimestamp) {
    _killCooldownEnd = endTimestamp;
  }

  function setMeetingCooldown(endTimestamp) {
    _meetingCooldownEnd = endTimestamp;
  }

  function setActionHint(text) {
    clearTimeout(_actionHintTimeout);
    document.getElementById('hud-action-hint').textContent = text;
    if (text) {
      _actionHintTimeout = setTimeout(() => {
        document.getElementById('hud-action-hint').textContent = '';
      }, 3000);
    }
  }

  function showSabotageAlert(text) {
    const el = document.getElementById('sabotage-alert');
    el.textContent = text;
    el.classList.remove('hidden');
  }

  function hideSabotageAlert() {
    document.getElementById('sabotage-alert').classList.add('hidden');
  }

  function _setupButtons(role) {
    document.getElementById('btn-meeting').onclick = () => {
      if (_onMeeting) _onMeeting();
    };

    document.querySelectorAll('.sabotage-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (_onSabotage) _onSabotage(btn.dataset.id);
      });
    });
  }

  function _startCooldownLoop() {
    clearInterval(_killCdInterval);
    _killCdInterval = setInterval(() => {
      const now = Date.now();

      // Kill cooldown
      if (_role === 'virus') {
        const remaining = Math.max(0, _killCooldownEnd - now);
        const maxCd = 30000;
        const pct = remaining > 0 ? (remaining / maxCd) * 100 : 0;
        document.getElementById('kill-cd-bar-fill').style.width = `${pct}%`;
        document.getElementById('kill-cd-text').textContent = remaining > 0 ? `${Math.ceil(remaining / 1000)}s` : 'READY';
      }

      // Meeting button cooldown
      const meetingBtn = document.getElementById('btn-meeting');
      if (_meetingCooldownEnd > now) {
        meetingBtn.disabled = true;
        const secs = Math.ceil((_meetingCooldownEnd - now) / 1000);
        meetingBtn.textContent = `⚠ EMERGENCY (${secs}s)`;
      } else {
        meetingBtn.disabled = false;
        meetingBtn.textContent = '⚠ EMERGENCY';
      }
    }, 100);
  }

  function onMeetingButton(cb) { _onMeeting = cb; }
  function onKillButton(cb)    { _onKill = cb; }
  function onSabotage(cb)      { _onSabotage = cb; }

  return {
    show, hide, setDead,
    updateTaskProgress,
    setKillCooldown, setMeetingCooldown,
    setActionHint,
    showSabotageAlert, hideSabotageAlert,
    onMeetingButton, onKillButton, onSabotage,
  };
})();

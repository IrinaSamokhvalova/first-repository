const STORAGE_KEY = 'hygieneSurveyResponses';
const CREATOR_EMAIL_KEY = 'hygieneSurveyCreatorEmail';
const OPTIONS = ['Никогда', '1 раз в день', '2 раза в день', 'Другое'];
const SCORE_MAP = { 'Никогда': 0, '1 раз в день': 1, '2 раза в день': 2 };

function getResponses() {
  return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
}

function saveResponses(responses) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(responses));
}

function renderCountChart(targetEl, title, counts) {
  const chart = document.createElement('div');
  chart.className = 'chart-card';
  chart.innerHTML = `<h3>${title}</h3>`;

  const maxValue = Math.max(1, ...Object.values(counts));
  for (const option of OPTIONS) {
    const value = counts[option] || 0;
    const row = document.createElement('div');
    row.className = 'bar-row';
    row.innerHTML = `
      <span>${option}</span>
      <div class="bar" style="width:${(value / maxValue) * 100}%"></div>
      <strong>${value}</strong>
    `;
    chart.appendChild(row);
  }

  targetEl.appendChild(chart);
}

function renderAvgChart(targetEl, rows) {
  targetEl.innerHTML = '';
  const maxValue = 2;

  rows.forEach((row) => {
    const card = document.createElement('div');
    card.className = 'chart-card';
    const pct = Math.max(0, (row.value / maxValue) * 100);
    card.innerHTML = `
      <h3>${row.label}</h3>
      <div class="bar-row">
        <span>Среднее значение</span>
        <div class="bar" style="width:${pct}%"></div>
        <strong>${row.value.toFixed(2)}</strong>
      </div>
    `;
    targetEl.appendChild(card);
  });
}

function aggregateCounts(responses, field) {
  const counts = Object.fromEntries(OPTIONS.map((item) => [item, 0]));
  responses.forEach((entry) => {
    if (counts[entry[field]] !== undefined) counts[entry[field]] += 1;
  });
  return counts;
}

function meanScore(responses, field) {
  const numeric = responses
    .map((entry) => SCORE_MAP[entry[field]])
    .filter((score) => typeof score === 'number');
  if (!numeric.length) return 0;
  return numeric.reduce((a, b) => a + b, 0) / numeric.length;
}

function serializeCsv(responses) {
  const headers = ['timestamp', 'wash', 'washComment', 'teeth', 'teethComment'];
  const rows = responses.map((entry) => headers.map((key) => `"${String(entry[key] || '').replaceAll('"', '""')}"`).join(','));
  return [headers.join(','), ...rows].join('\n');
}

function initSurveyPage() {
  const form = document.getElementById('surveyForm');
  if (!form) return;

  const submitStatus = document.getElementById('submitStatus');
  const washComment = document.getElementById('washComment');
  const teethComment = document.getElementById('teethComment');
  const resultsSection = document.getElementById('resultsSection');
  const userChart = document.getElementById('userChart');

  const syncCommentState = (groupName, inputEl) => {
    const checked = form.querySelector(`input[name="${groupName}"]:checked`);
    const isOther = checked && checked.value === 'Другое';
    inputEl.disabled = !isOther;
    inputEl.required = Boolean(isOther);
    if (!isOther) inputEl.value = '';
  };

  form.addEventListener('change', () => {
    syncCommentState('wash', washComment);
    syncCommentState('teeth', teethComment);
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    syncCommentState('wash', washComment);
    syncCommentState('teeth', teethComment);

    if (!form.reportValidity()) return;

    const formData = new FormData(form);
    const response = {
      timestamp: new Date().toISOString(),
      wash: formData.get('wash'),
      washComment: formData.get('washComment') || '',
      teeth: formData.get('teeth'),
      teethComment: formData.get('teethComment') || ''
    };

    const responses = getResponses();
    responses.push(response);
    saveResponses(responses);

    const creatorEmail = localStorage.getItem(CREATOR_EMAIL_KEY);
    if (creatorEmail) {
      const subject = encodeURIComponent('Новый ответ на опрос по гигиене');
      const body = encodeURIComponent(
        `Время: ${response.timestamp}\n` +
        `Мыться: ${response.wash}${response.washComment ? ` (${response.washComment})` : ''}\n` +
        `Чистить зубы: ${response.teeth}${response.teethComment ? ` (${response.teethComment})` : ''}`
      );
      window.location.href = `mailto:${creatorEmail}?subject=${subject}&body=${body}`;
      submitStatus.textContent = 'Ответ сохранён. Открыт почтовый клиент для отправки на email создателя.';
    } else {
      submitStatus.textContent = 'Ответ сохранён. Email создателя не задан в админ-панели.';
    }

    userChart.innerHTML = '';
    renderCountChart(userChart, 'Как часто вы моетесь?', aggregateCounts(responses, 'wash'));
    renderCountChart(userChart, 'Как часто вы чистите зубы?', aggregateCounts(responses, 'teeth'));
    resultsSection.classList.remove('hidden');
    form.reset();
    washComment.disabled = true;
    teethComment.disabled = true;
  });
}

function initAdminPage() {
  const settingsForm = document.getElementById('settingsForm');
  if (!settingsForm) return;

  const creatorEmailInput = document.getElementById('creatorEmail');
  const settingsStatus = document.getElementById('settingsStatus');
  const avgChart = document.getElementById('avgChart');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const exportStatus = document.getElementById('exportStatus');

  creatorEmailInput.value = localStorage.getItem(CREATOR_EMAIL_KEY) || '';

  settingsForm.addEventListener('submit', (event) => {
    event.preventDefault();
    localStorage.setItem(CREATOR_EMAIL_KEY, creatorEmailInput.value.trim());
    settingsStatus.textContent = 'Email создателя сохранён.';
  });

  const responses = getResponses();
  renderAvgChart(avgChart, [
    { label: 'Мыться', value: meanScore(responses, 'wash') },
    { label: 'Чистить зубы', value: meanScore(responses, 'teeth') }
  ]);

  exportCsvBtn.addEventListener('click', () => {
    const latestResponses = getResponses();
    if (!latestResponses.length) {
      exportStatus.textContent = 'Пока нет данных для выгрузки.';
      return;
    }

    const csv = serializeCsv(latestResponses);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'hygiene-survey-results.csv';
    link.click();
    URL.revokeObjectURL(url);

    exportStatus.textContent = `CSV выгружен (${latestResponses.length} записей).`;
  });
}

initSurveyPage();
initAdminPage();

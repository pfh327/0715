const STORAGE_KEY = "classcare-demo-v1";
const SUPABASE_URL = "https://cukdtvyspcobplglwkdz.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_mCTUYJuJaA2xbZlzUyEXUg_kCNWhV6v";
const SUPABASE_SEED_KEY = "classcare-supabase-seeded-v1";
const supabase = window.supabase?.createClient
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
  : null;

const demoData = {
  students: [
    {
      id: crypto.randomUUID(),
      name: "김민서",
      subject: "수학",
      grade: "중2",
      schedule: "화/목 19:00",
      parentNote: "숙제 진행 상황을 자세히 공유받길 원함",
      focus: "분수 계산과 서술형 풀이를 함께 보강 중"
    },
    {
      id: crypto.randomUUID(),
      name: "이도윤",
      subject: "영어",
      grade: "초6",
      schedule: "수/토 17:30",
      parentNote: "영단어 암기 습관을 꾸준히 보고 싶어 하심",
      focus: "독해는 무난하지만 문장 쓰기와 문법 실수가 잦음"
    }
  ],
  records: []
};

demoData.records = [
  {
    id: crypto.randomUUID(),
    studentId: demoData.students[0].id,
    date: "2026-07-13",
    understanding: "보통",
    lessonSummary: "일차방정식 활용 문제를 풀고, 오답 유형별로 식 세우는 연습을 진행했습니다.",
    homework: "유형서 3-2 1~12번, 틀린 문제는 오답노트 작성",
    weaknessNotes: "문장제에서 식을 세우는 데 시간이 오래 걸리고, 부호 처리 실수가 반복되었습니다.",
    tags: ["응용 문제", "연산 실수"]
  },
  {
    id: crypto.randomUUID(),
    studentId: demoData.students[0].id,
    date: "2026-07-15",
    understanding: "낮음",
    lessonSummary: "분수와 소수 혼합 계산 문제를 복습하고, 서술형 풀이 순서를 다시 정리했습니다.",
    homework: "프린트 2장, 분수 계산 15문제",
    weaknessNotes: "서술형에서 풀이를 짧게 쓰고, 계산 과정 생략으로 실수가 발생했습니다.",
    tags: ["서술형", "연산 실수"]
  },
  {
    id: crypto.randomUUID(),
    studentId: demoData.students[1].id,
    date: "2026-07-14",
    understanding: "보통",
    lessonSummary: "독해 지문 2개를 풀고, 핵심 문장 찾기와 시제 문법을 복습했습니다.",
    homework: "영단어 25개 암기, 독해 지문 1개",
    weaknessNotes: "과거형과 현재완료를 혼동하고, 문장 작성 시 관사 누락이 있었습니다.",
    tags: ["개념 이해"]
  }
];

const state = { students: [], records: [] };
let selectedStudentId = sessionStorage.getItem("classcare-selected-student") || null;
let selectedTags = [];
let activeMessageType = sessionStorage.getItem("classcare-message-type") || "student";
let ocrWorkerPromise = null;
let storageMode = "local";
let reviewRecommendations = [];
let savedReports = [];
let currentUser = null;

if (!["student", "parent"].includes(activeMessageType)) {
  activeMessageType = "student";
  sessionStorage.setItem("classcare-message-type", activeMessageType);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    await initializeAuth();
  } catch (error) {
    console.error("Auth initialization failed.", error);
  }

  bindGlobal();

  try {
    await initializeAppState();
  } catch (error) {
    console.error("App state initialization failed.", error);
    replaceState(loadState());
    ensureSelectedStudent();
    renderShared();
  }

  const page = document.body.dataset.page;
  if (page === "home") renderHomePage();
  if (page === "students") renderStudentsPage();
  if (page === "records") renderRecordsPage();
  if (page === "review") renderReviewPage();
  if (page === "reports") renderReportsPage();
});

function bindGlobal() {
  renderAuthCard();
  const resetBtn = document.getElementById("resetDemoButton");
  const deleteBtn = document.getElementById("deleteStudentButton");
  const studentForm = document.getElementById("studentForm");

  resetBtn?.addEventListener("click", async () => {
    const confirmed = window.confirm("데모 데이터 전체를 초기화할까요? 이 작업은 되돌릴 수 없습니다.");
    if (!confirmed) return;
    const verify = window.prompt('초기화를 진행하려면 "RESET" 을 입력해 주세요.');
    if (verify === null) return;
    if (verify.trim() !== "RESET") {
      alert("입력값이 일치하지 않아 초기화가 취소되었습니다.");
      return;
    }
    if (!requireAuthAction()) return;
    await resetAllData();
    sessionStorage.removeItem("classcare-selected-student");
    location.reload();
  });

  deleteBtn?.addEventListener("click", async () => {
    const student = getSelectedStudent();
    if (!student) return alert("삭제할 학생이 없습니다.");
    if (!window.confirm(`${student.name} 학생과 연결된 수업 기록을 모두 삭제할까요?`)) return;
    const verify = window.prompt(`삭제를 진행하려면 학생 이름 "${student.name}"을(를) 다시 입력해 주세요.`);
    if (verify === null) return;
    if (verify.trim() !== student.name) return alert("학생 이름이 일치하지 않아 삭제가 취소되었습니다.");
    if (!requireAuthAction()) return;
    await deleteStudent(student.id);
    state.students = state.students.filter((item) => item.id !== student.id);
    state.records = state.records.filter((record) => record.studentId !== student.id);
    selectedStudentId = state.students[0]?.id || null;
    persist();
    syncSelectedStudent();
    location.reload();
  });

  studentForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const newStudent = {
      id: crypto.randomUUID(),
      name: value("studentName"),
      subject: value("studentSubject"),
      grade: value("studentGrade"),
      schedule: value("studentSchedule"),
      parentNote: value("parentNote"),
      focus: value("studentFocus")
    };
    if (!requireAuthAction()) return;
    await saveStudent(newStudent);
    state.students.unshift(newStudent);
    selectedStudentId = newStudent.id;
    persist();
    syncSelectedStudent();
    studentForm.reset();
    location.reload();
  });

  renderShared();
}

function renderShared() {
  if (document.getElementById("studentList")) {
    renderStudentList();
  }
  renderSummary();
}

function renderStudentList() {
  const studentList = document.getElementById("studentList");
  if (!studentList) return;
  if (!state.students.length) {
    studentList.innerHTML = '<div class="empty-state">등록된 학생이 없습니다.<br>왼쪽 폼에서 첫 학생을 추가해 주세요.</div>';
    return;
  }
  studentList.innerHTML = state.students.map((student) => {
    const recent = getStudentRecords(student.id)[0];
    return `
      <article class="student-card ${selectedStudentId === student.id ? "active" : ""}" data-student-id="${student.id}">
        <div class="student-top">
          <div><strong>${student.name}</strong></div>
          <span class="subject-pill">${student.subject}</span>
        </div>
        <div class="student-meta">${student.grade || "학년 미입력"} · ${student.schedule || "일정 미입력"}</div>
        <div class="student-focus muted">
          <div><strong>현재 집중 영역</strong></div>
          <div>${student.focus || "설정된 집중 영역이 없습니다."}</div>
          <div style="margin-top:10px;"><strong>최근 수업</strong></div>
          <div>${recent ? `${formatDate(recent.date)} · ${recent.lessonSummary}` : "아직 수업 기록이 없습니다."}</div>
        </div>
      </article>
    `;
  }).join("");

  studentList.querySelectorAll(".student-card").forEach((card) => {
    card.addEventListener("click", () => {
      selectedStudentId = card.dataset.studentId;
      syncSelectedStudent();
      location.reload();
    });
  });
}

function renderSummary() {
  text("studentCount", String(state.students.length));
  text("recordCount", String(state.records.length));
  text("selectedStudentLabel", getSelectedStudent()?.name || "-");
  const tags = getStudentRecords(selectedStudentId).flatMap((record) => record.tags);
  text("focusKeyword", tags[0] || "없음");
  const deleteBtn = document.getElementById("deleteStudentButton");
  if (deleteBtn) deleteBtn.disabled = !getSelectedStudent();
  text("authStateHint", currentUser ? `${getCurrentUsername()} 계정으로 저장 중` : "로그인하면 개인 데이터가 저장됩니다.");
}

function renderHomePage() {
  const student = getSelectedStudent();
  const records = getStudentRecords(student?.id);
  const homeSelect = document.getElementById("homeStudentSelect");
  if (homeSelect) {
    homeSelect.innerHTML = state.students.map((item) => `<option value="${item.id}" ${item.id === selectedStudentId ? "selected" : ""}>${item.name} · ${item.subject}</option>`).join("");
    homeSelect.addEventListener("change", () => {
      selectedStudentId = homeSelect.value;
      syncSelectedStudent();
      location.reload();
    });
  }
  text("progressTrend", records.length ? records.slice(0, 2).map((r) => `${formatDate(r.date)}: ${r.lessonSummary}`).join(" / ") : "학생을 선택하면 최근 수업 흐름이 표시됩니다.");
  const weaknessStats = countTags(records);
  text("weaknessSummary", Object.keys(weaknessStats).length ? Object.entries(weaknessStats).slice(0, 3).map(([tag, count]) => `${tag} ${count}회`).join(", ") : "누적 기록이 생기면 자주 등장한 약점이 요약됩니다.");
  text("understandingSummary", records.length ? `최근 ${Math.min(records.length, 3)}회 수업 기준 이해도는 ${records.slice(0, 3).map((item) => item.understanding).join(" → ")} 흐름입니다.` : "최근 이해도와 수업 반응이 정리됩니다.");
  text("insightBanner", student ? buildInsight(student, records, weaknessStats) : "현재는 분석할 학생이 없습니다. 왼쪽에서 학생을 등록해 주세요.");
  renderMessageByType(student, records[0]);
  document.querySelectorAll(".message-tab").forEach((button) => {
    button.classList.toggle("active", button.dataset.messageType === activeMessageType);
    button.addEventListener("click", () => {
      activeMessageType = button.dataset.messageType;
      sessionStorage.setItem("classcare-message-type", activeMessageType);
      renderMessageByType(student, records[0]);
      document.querySelectorAll(".message-tab").forEach((item) => item.classList.toggle("active", item.dataset.messageType === activeMessageType));
    });
  });
  document.getElementById("copyMessageButton")?.addEventListener("click", async () => {
    await copyText(document.getElementById("messageBox")?.textContent || "", "copyMessageButton", "문구 복사");
  });
}

function renderStudentsPage() {
  const timeline = document.getElementById("timeline");
  const records = getStudentRecords(selectedStudentId);
  if (!timeline) return;
  if (!records.length) {
    timeline.innerHTML = '<div class="empty-state">선택한 학생의 수업 기록이 아직 없습니다.</div>';
    return;
  }
  timeline.innerHTML = records.map((record) => `
    <article class="timeline-item">
      <div class="timeline-top"><strong>${formatDate(record.date)}</strong><span>이해도 ${record.understanding}</span></div>
      <div class="timeline-body">
        <div><strong>오늘 수업</strong> ${record.lessonSummary}</div>
        <div><strong>숙제</strong> ${record.homework}</div>
        <div><strong>어려웠던 부분</strong> ${record.weaknessNotes}</div>
        <div class="chip-row">${record.tags.map((tag) => `<span class="chip">${tag}</span>`).join("")}</div>
      </div>
    </article>
  `).join("");
}

function renderRecordsPage() {
  const recordDate = document.getElementById("recordDate");
  const student = getSelectedStudent();
  text("recordStudentInfo", student ? `${student.name} · ${student.subject} · ${student.grade || "학년 미입력"} · ${student.schedule || "일정 미입력"}\n현재 집중 영역: ${student.focus || "설정 없음"}` : "학생을 선택하면 이곳에 현재 선택된 학생 정보가 표시됩니다.");
  if (recordDate) recordDate.value = new Date().toISOString().split("T")[0];
  const select = document.getElementById("recordStudentSelect");
  if (select) {
    select.innerHTML = state.students.map((student) => `<option value="${student.id}" ${student.id === selectedStudentId ? "selected" : ""}>${student.name} · ${student.subject}</option>`).join("");
    select.addEventListener("change", () => {
      selectedStudentId = select.value;
      syncSelectedStudent();
    });
  }
  document.getElementById("tagSelector")?.addEventListener("click", (event) => {
    const button = event.target.closest(".tag-btn");
    if (!button) return;
    const tag = button.dataset.tag;
    const exists = selectedTags.includes(tag);
    selectedTags = exists ? selectedTags.filter((item) => item !== tag) : [...selectedTags, tag];
    button.classList.toggle("active", !exists);
  });
  document.getElementById("recordForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const record = {
      id: crypto.randomUUID(),
      studentId: document.getElementById("recordStudentSelect").value,
      date: value("recordDate"),
      understanding: value("understandingLevel"),
      lessonSummary: value("lessonSummary"),
      homework: value("homework"),
      weaknessNotes: value("weaknessNotes"),
      tags: [...selectedTags]
    };
    if (!requireAuthAction()) return;
    await saveLessonRecord(record);
    state.records.unshift(record);
    selectedStudentId = record.studentId;
    persist();
    syncSelectedStudent();
    location.href = "index.html";
  });
}

function renderReportsPage() {
  const student = getSelectedStudent();
  const records = getStudentRecords(student?.id);
  const latest = records[0];
  const weaknessStats = countTags(records);
  const latestSavedReport = getLatestSavedReport(student?.id);
  const reportSnapshot = buildReportSnapshot(student, records, latest, weaknessStats);
  text("reportStudentInfo", student ? `${student.name} 학생 기준으로 누적 리포트를 생성하고 있습니다. ${student.subject} · ${student.grade || "학년 미입력"} · ${student.schedule || "일정 미입력"}` : "학생관리 페이지에서 선택한 학생을 기준으로 리포트가 생성됩니다.");
  applyReportSnapshot(latestSavedReport || reportSnapshot);
  text(
    "reportSaveStatus",
    latestSavedReport
      ? `최근 저장 리포트: ${formatDateTime(latestSavedReport.createdAt)}`
      : "현재 화면 기준으로 리포트를 저장할 수 있습니다."
  );
  document.getElementById("saveReportButton")?.addEventListener("click", async () => {
    if (!student) {
      alert("저장할 학생이 없습니다.");
      return;
    }
    const saved = await saveReportSnapshot(reportSnapshot);
    if (saved) {
      text("reportSaveStatus", `리포트를 저장했어요. ${formatDateTime(saved.createdAt)} 기준`);
    }
  });
  document.getElementById("copyReportButton")?.addEventListener("click", async () => {
    await copyText(buildReportPlainText(), "copyReportButton", "리포트 복사");
  });
  document.getElementById("printReportButton")?.addEventListener("click", () => window.print());
}

function renderReviewPage() {
  const student = getSelectedStudent();
  const select = document.getElementById("reviewStudentSelect");
  const imageInput = document.getElementById("reviewImageInput");
  const imagePreview = document.getElementById("reviewImagePreview");
  const notesArea = document.getElementById("reviewNotes");
  const problemTextArea = document.getElementById("reviewProblemText");
  const extractOcrButton = document.getElementById("extractOcrButton");
  const generateButton = document.getElementById("generateReviewButton");
  const copyButton = document.getElementById("copyAiReviewButton");
  const downloadDocButton = document.getElementById("downloadReviewDocButton");
  const currentRecord = getStudentRecords(student?.id)[0];

  text("reviewStudentInfo", student ? `${student.name} · ${student.subject} · ${student.grade || "학년 미입력"} · ${student.schedule || "일정 미입력"}` : "학생을 선택하면 현재 학생 정보가 표시됩니다.");

  if (select) {
    select.innerHTML = state.students.map((item) => `<option value="${item.id}" ${item.id === selectedStudentId ? "selected" : ""}>${item.name} · ${item.subject}</option>`).join("");
    select.addEventListener("change", () => {
      selectedStudentId = select.value;
      syncSelectedStudent();
      location.reload();
    });
  }

  imageInput?.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    if (!file) {
      imagePreview.innerHTML = '<span class="muted">업로드한 이미지가 여기에 표시됩니다.</span>';
      text("ocrStatus", "OCR 대기 중");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      imagePreview.innerHTML = `<img src="${reader.result}" alt="업로드한 오답 문제 이미지">`;
      text("ocrStatus", "이미지 업로드 완료, OCR 추출 가능");
    };
    reader.readAsDataURL(file);
  });

  extractOcrButton?.addEventListener("click", async () => {
    const file = imageInput?.files?.[0];
    if (!file) {
      alert("먼저 틀린 문제 이미지를 업로드해 주세요.");
      return;
    }
    if (!window.Tesseract) {
      alert("OCR 라이브러리를 불러오지 못했습니다. 인터넷 연결 상태를 확인해 주세요.");
      return;
    }

    setButtonState(extractOcrButton, true, "OCR 추출 중...");
    text("ocrStatus", "이미지에서 글자를 읽는 중이에요. 잠시만 기다려 주세요.");

    try {
      const ocrText = await extractTextFromImage(file);
      const cleanedText = cleanOcrText(ocrText);
      if (!cleanedText) {
        text("ocrStatus", "글자를 찾지 못했어요. 사진을 더 밝고 반듯하게 다시 올리거나 문제 텍스트를 직접 입력해 주세요.");
        return;
      }
      problemTextArea.value = cleanedText;
      text("ocrStatus", "OCR 추출 완료. 문제 텍스트 입력칸에 자동 반영했어요.");
    } catch {
      text("ocrStatus", "OCR 추출에 실패했어요. 잠시 후 다시 시도해 주세요.");
    } finally {
      setButtonState(extractOcrButton, false, "OCR 텍스트 추출");
    }
  });

  generateButton?.addEventListener("click", () => {
    const noteText = notesArea?.value.trim() || "";
    const problemText = problemTextArea?.value.trim() || "";
    if (!noteText && !problemText && !currentRecord) {
      alert("문제 핵심 메모나 문제 텍스트를 먼저 입력해 주세요.");
      return;
    }
    const generated = buildImageBasedReviewProblems(student, currentRecord, noteText, problemText);
    text("reviewSummary", generated.summary);
    document.getElementById("reviewProblemList").innerHTML = generated.problems.map((problem) => `<li>${problem}</li>`).join("");
    if (!requireAuthAction(false)) return;
    saveReviewRecommendation({
      studentId: student?.id || null,
      sourceProblemText: problemText,
      teacherNote: noteText,
      ocrText: problemText,
      summary: generated.summary,
      recommendedProblems: generated.problems,
      imageUrl: imagePreview.querySelector("img")?.src || null
    });
  });

  copyButton?.addEventListener("click", async () => {
    const summary = document.getElementById("reviewSummary")?.textContent || "";
    const problems = Array.from(document.querySelectorAll("#reviewProblemList li")).map((item, index) => `${index + 1}. ${item.textContent}`).join("\n");
    await copyText([summary, problems].join("\n\n"), "copyAiReviewButton", "문제 복사");
  });

  downloadDocButton?.addEventListener("click", () => {
    downloadReviewDocument(getSelectedStudent(), notesArea?.value.trim() || "", problemTextArea?.value.trim() || "");
  });
}

function getSelectedStudent() {
  return state.students.find((student) => student.id === selectedStudentId) || null;
}

function getStudentRecords(studentId) {
  return state.records.filter((record) => record.studentId === studentId).sort((a, b) => new Date(b.date) - new Date(a.date));
}

function countTags(records) {
  return records.reduce((acc, record) => {
    record.tags.forEach((tag) => acc[tag] = (acc[tag] || 0) + 1);
    return acc;
  }, {});
}

function generateParentMessage(student, record) {
  return [
    `${student.name} 학생 학부모님, 안녕하세요.`,
    "",
    `오늘 ${student.subject} 수업에서는 ${record.lessonSummary}`,
    `숙제는 ${record.homework} 입니다.`,
    `수업 중 이해도는 ${record.understanding} 수준이었고, 특히 ${record.weaknessNotes}`,
    "",
    "다음 수업 전까지 숙제를 확인해 주시면 학습 흐름을 더 안정적으로 이어갈 수 있습니다. 감사합니다."
  ].join("\n");
}

function generateStudentMessage(student, record) {
  const studentCall = buildStudentCallName(student.name);
  return [
    `${studentCall}, 오늘은 ${toFriendlyBanmal(record.lessonSummary)}`,
    `특히 ${toFriendlyBanmal(record.weaknessNotes)}`,
    `숙제는 ${toHomeworkBanmal(record.homework)}`,
    "조금 헷갈렸던 부분도 있었지만 차근차근 다시 보면 충분히 잘할 수 있어.",
    "너무 조급해하지 말고 하나씩 다시 해보자. 다음 시간에 선생님이랑 같이 확인해보자."
  ].join("\n\n");
}

function renderMessageByType(student, record) {
  if (!student || !record) {
    text("messageBox", "학생을 등록하고 수업 기록을 저장하면 이곳에 메시지가 생성됩니다.");
    return;
  }

  if (activeMessageType === "parent") {
    text("messageBox", generateParentMessage(student, record));
    return;
  }

  text("messageBox", generateStudentMessage(student, record));
}

function buildRecommendedProblems(student, record) {
  const subject = student.subject || "";
  const tags = record.tags || [];
  const lesson = record.lessonSummary || "";
  const weakness = record.weaknessNotes || "";

  if (subject === "수학") {
    return buildMathProblems(tags, lesson, weakness);
  }

  if (subject === "영어") {
    return buildEnglishProblems(tags, lesson, weakness);
  }

  if (subject === "과학") {
    return buildScienceProblems(tags, lesson, weakness);
  }

  return buildKoreanProblems(tags, lesson, weakness);
}

function buildImageBasedReviewProblems(student, record, noteText, problemText) {
  const subject = student?.subject || "";
  const explicitContext = [problemText, noteText].filter(Boolean).join(" ");
  const fallbackLesson = record?.lessonSummary || "";
  const fallbackWeakness = record?.weaknessNotes || "";
  const combinedRecord = {
    ...record,
    lessonSummary: `${explicitContext || fallbackLesson}`.trim(),
    weaknessNotes: `${noteText || fallbackWeakness}`.trim(),
    tags: deriveTagsFromReviewInput(problemText, noteText, record?.tags || [])
  };
  const problems = buildRecommendedProblems(student || { subject }, combinedRecord);
  const summary = explicitContext
    ? `직접 입력한 문제 문장과 메모를 우선 반영해서 "${summarizeReviewInput(problemText, noteText)}" 유형 복습문제를 추천했어요.`
    : "입력된 메모가 없어 최근 수업 기록을 기준으로 비슷한 유형 문제를 추천했어요.";
  return { summary, problems };
}

function buildMathProblems(tags, lesson, weakness) {
  const problems = [];
  const lessonText = normalizeText(`${lesson} ${weakness}`);

  if (includesAny(lessonText, ["함수", "대응", "정의역", "치역", "x값", "y값"])) {
    problems.push("다음 중 함수의 설명으로 옳은 것을 고르시오. ① 한 x에 여러 y가 대응해도 함수이다 ② 한 x에 한 y만 대응해야 함수이다 ③ y가 같으면 모두 함수가 아니다 ④ x와 y가 모두 문자면 함수가 아니다");
    problems.push("다음 대응 관계가 함수인지 아닌지 판단하고 이유를 쓰시오. x: 1, 2, 3 / y: 4, 4, 5");
  }

  if (includesAny(lessonText, ["일차함수", "y=ax+b", "기울기", "절편"])) {
    problems.push("일차함수 y = 2x - 3 에서 기울기와 y절편을 각각 구하시오.");
    problems.push("점 (1, 3)을 지나고 기울기가 2인 직선의 식을 구하시오.");
  }

  if (includesAny(lessonText, ["반비례", "y=a/x", "y=a÷x"])) {
    problems.push("반비례 관계 y = 12/x 에서 x = 3 일 때 y의 값을 구하시오.");
    problems.push("다음 식 y = -8/x 가 반비례 관계인지 말하고, 상수 a의 값을 구하시오.");
  }

  if (includesAny(lessonText, ["그래프", "평행이동", "좌표", "직선"])) {
    problems.push("직선 y = x + 2 의 그래프를 y축 방향으로 3만큼 평행이동한 식을 구하시오.");
    problems.push("직선 y = -2x + 1 과 y = -2x - 4 의 관계를 설명하시오.");
  }

  if (includesAny(lessonText, ["분수", "소수", "통분"])) {
    problems.push("3/4 + 0.5 를 계산하시오.");
    problems.push("1.2 - 2/5 를 계산하시오.");
  }

  if (includesAny(lessonText, ["일차방정식", "방정식"])) {
    problems.push("2x + 5 = 17 일 때 x의 값을 구하시오.");
    problems.push("어떤 수에 3을 더했더니 11이 되었다. 이 수를 구하시오.");
  }

  if (tags.includes("서술형") || lessonText.includes("서술")) {
    problems.push("이차함수 y = x² - 4x + 3 의 최소값을 구하는 과정을 서술하시오.");
  }

  if (tags.includes("연산 실수")) {
    problems.push("(-3) + 7 - 5 를 계산하시오.");
  }

  if (tags.includes("응용 문제") || lessonText.includes("문장제")) {
    problems.push("연필 3자루와 공책 2권의 가격이 7,000원일 때, 연필 한 자루를 x원으로 놓고 식을 세우시오.");
  }

  if (includesAny(lessonText, ["옳은 것", "보기", "설명"])) {
    problems.push("다음 중 일차함수 y = -3x + 4 에 대한 설명으로 옳은 것을 고르시오. ① 기울기는 4이다 ② y절편은 -3이다 ③ x가 1 증가할 때 y는 3 감소한다 ④ 그래프는 x축과 평행하다");
  }

  while (problems.length < 3) {
    problems.push("오늘 배운 개념을 다시 확인할 수 있는 기본 문제 1개를 스스로 풀어보시오.");
  }

  return dedupeProblems(problems).slice(0, 5);
}

function buildEnglishProblems(tags, lesson, weakness) {
  const problems = [];
  problems.push("다음 문장을 과거형으로 바꾸시오: I go to school every day.");
  problems.push("빈칸에 알맞은 관사를 넣으시오: I saw ___ apple on the table.");
  if (tags.includes("개념 이해") || weakness.includes("문법")) {
    problems.push("현재완료와 과거형의 차이를 생각하며 다음 문장을 완성하시오: I ( ) my homework already.");
  }
  if (lesson.includes("독해")) {
    problems.push("짧은 지문을 읽고 중심 문장을 한 문장으로 써보시오.");
  }
  return problems.slice(0, 5);
}

function buildScienceProblems(tags, lesson, weakness) {
  const problems = [
    "오늘 배운 과학 개념을 한 문장으로 설명하시오.",
    "핵심 용어 3개를 쓰고 각각의 뜻을 정리하시오.",
    "오늘 배운 개념이 일상생활에서 어떻게 쓰이는지 예를 1개 적으시오."
  ];
  if (tags.includes("서술형")) {
    problems.push("실험 결과를 보고 왜 그런 결과가 나왔는지 서술하시오.");
  }
  return problems.slice(0, 5);
}

function buildKoreanProblems(tags, lesson, weakness) {
  const problems = [
    "오늘 배운 내용을 한 문장으로 요약하시오.",
    "핵심 개념어 3개를 골라 뜻을 설명하시오.",
    "오늘 어려웠던 부분을 다시 읽고 스스로 설명해보시오."
  ];
  if (tags.includes("서술형")) {
    problems.push("제시된 내용을 읽고 자신의 생각을 3문장으로 서술하시오.");
  }
  return problems.slice(0, 5);
}

function deriveTagsFromReviewInput(problemText, noteText, existingTags) {
  const text = normalizeText(`${problemText} ${noteText}`);
  const tags = [...existingTags];
  if (includesAny(text, ["서술", "과정", "이유"])) tags.push("서술형");
  if (includesAny(text, ["실수", "계산", "부호"])) tags.push("연산 실수");
  if (includesAny(text, ["활용", "문장제", "응용"])) tags.push("응용 문제");
  return [...new Set(tags)];
}

function summarizeReviewInput(problemText, noteText) {
  const raw = [problemText, noteText].filter(Boolean).join(" / ").replace(/\s+/g, " ").trim();
  return raw.length > 52 ? `${raw.slice(0, 52)}...` : raw;
}

function normalizeText(text) {
  return (text || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function includesAny(text, keywords) {
  return keywords.some((keyword) => text.includes(keyword.toLowerCase()));
}

function dedupeProblems(problems) {
  return [...new Set(problems.filter(Boolean))];
}

function downloadReviewDocument(student, teacherMemo, sourceProblemText) {
  const summary = document.getElementById("reviewSummary")?.textContent?.trim() || "";
  const problems = Array.from(document.querySelectorAll("#reviewProblemList li"))
    .map((item) => item.textContent?.trim())
    .filter(Boolean);

  if (!problems.length || problems[0] === "아직 생성된 추천 문제가 없습니다.") {
    alert("먼저 추천 문제를 생성한 뒤 문서로 저장해 주세요.");
    return;
  }

  const studentLine = student
    ? `${student.name} · ${student.subject} · ${student.grade || "학년 미입력"} · ${student.schedule || "일정 미입력"}`
    : "학생 정보 없음";
  const createdDate = new Date().toLocaleDateString("ko-KR", { year: "numeric", month: "long", day: "numeric" });
  const safeName = (student?.name || "학생").replace(/[\\/:*?"<>|]/g, "_");
  const titleName = student?.name || "학생";
  const memoText = teacherMemo || "기록된 선생님 메모가 없습니다.";
  const sourceText = sourceProblemText || "직접 입력된 원문이 없습니다.";

  const html = `<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <title>복습문제 추천 문서</title>
  <style>
    @page { size: A4; margin: 24mm 18mm; }
    body { font-family: "Malgun Gothic", sans-serif; color: #222; line-height: 1.7; }
    .cover {
      min-height: 920px;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      padding: 34px 28px;
      border: 2px solid #f0dcb7;
      border-radius: 28px;
      background: linear-gradient(180deg, #fffdf8 0%, #fff4df 100%);
    }
    .cover-badge {
      display: inline-block;
      padding: 8px 14px;
      border-radius: 999px;
      background: #fff1cf;
      color: #9a6500;
      font-size: 12px;
      font-weight: 700;
      letter-spacing: 0.08em;
    }
    .cover-title {
      margin: 18px 0 8px;
      font-size: 34px;
      font-weight: 700;
      line-height: 1.25;
      color: #1f1c18;
    }
    .cover-subtitle {
      font-size: 18px;
      color: #6e655d;
      margin-bottom: 28px;
    }
    .cover-panel {
      padding: 18px 20px;
      border-radius: 18px;
      background: rgba(255, 255, 255, 0.82);
      border: 1px solid #ecd9bf;
    }
    .cover-meta {
      display: grid;
      gap: 8px;
      font-size: 14px;
      color: #514941;
    }
    .cover-footer {
      color: #7a7066;
      font-size: 13px;
    }
    .page-break {
      page-break-before: always;
    }
    .doc-body {
      padding-top: 12px;
    }
    h1 {
      font-size: 26px;
      margin: 0 0 8px;
      color: #1f1c18;
    }
    h2 {
      font-size: 18px;
      margin: 28px 0 10px;
      color: #2d2a26;
      padding-bottom: 6px;
      border-bottom: 1px solid #ecdcc7;
    }
    .title-accent {
      width: 72px;
      height: 6px;
      border-radius: 999px;
      background: linear-gradient(90deg, #ffbf4d 0%, #ffd78a 100%);
      margin: 0 0 18px;
    }
    .meta {
      color: #666;
      margin-bottom: 6px;
      font-size: 14px;
    }
    .summary, .memo-box, .source-box {
      padding: 14px 16px;
      background: #faf6ef;
      border: 1px solid #eadbc4;
      border-radius: 12px;
    }
    .memo-box {
      background: #fffdfa;
    }
    .source-box {
      background: #fffcf6;
    }
    ol {
      padding-left: 22px;
    }
    li {
      margin-bottom: 12px;
    }
    .problem-card {
      margin-top: 14px;
      padding: 18px 20px;
      border: 1px solid #eadbc4;
      border-radius: 16px;
      background: #ffffff;
    }
  </style>
</head>
<body>
  <section class="cover">
    <div>
      <span class="cover-badge">CLASSCARE REVIEW PACK</span>
      <div class="cover-title">${escapeHtml(titleName)} 맞춤 복습문제</div>
      <div class="cover-subtitle">틀린 문제 흐름을 바탕으로 정리한 출력용 추천 문제 세트</div>
      <div class="cover-panel">
        <div class="cover-meta">
          <div><strong>학생 정보</strong> ${escapeHtml(studentLine)}</div>
          <div><strong>생성일</strong> ${escapeHtml(createdDate)}</div>
          <div><strong>문서 유형</strong> OCR 기반 유사 문제 추천 문서</div>
        </div>
      </div>
    </div>
    <div class="cover-footer">ClassCare Tutor Document</div>
  </section>

  <section class="doc-body page-break">
    <h1>복습문제 추천 문서</h1>
    <div class="title-accent"></div>
    <div class="meta">학생 정보: ${escapeHtml(studentLine)}</div>
    <div class="meta">생성일: ${escapeHtml(createdDate)}</div>

    <h2>추천 요약</h2>
    <div class="summary">${escapeHtml(summary).replace(/\n/g, "<br>")}</div>

    <h2>선생님 메모</h2>
    <div class="memo-box">${escapeHtml(memoText).replace(/\n/g, "<br>")}</div>

    <h2>원문 / OCR 참고 내용</h2>
    <div class="source-box">${escapeHtml(sourceText).replace(/\n/g, "<br>")}</div>

    <h2>추천 문제</h2>
    <div class="problem-card">
      <ol>
        ${problems.map((problem) => `<li>${escapeHtml(problem)}</li>`).join("")}
      </ol>
    </div>
  </section>
</body>
</html>`;

  const blob = new Blob(["\ufeff", html], { type: "application/msword;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeName}_복습문제추천.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function extractTextFromImage(file) {
  const worker = await getOcrWorker();
  const result = await worker.recognize(file);
  return result?.data?.text || "";
}

async function getOcrWorker() {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = window.Tesseract.createWorker("kor+eng");
  }
  return ocrWorkerPromise;
}

function cleanOcrText(text) {
  return (text || "")
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join("\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim();
}

function setButtonState(button, disabled, label) {
  if (!button) return;
  button.disabled = disabled;
  button.textContent = label;
}

function escapeHtml(text) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildInsight(student, records, weaknessStats) {
  if (!records.length) return `${student.name} 학생은 아직 수업 기록이 없습니다. 첫 수업 내용을 입력하면 누적 분석이 시작됩니다.`;
  const topWeakness = Object.entries(weaknessStats).sort((a, b) => b[1] - a[1])[0];
  return `${student.name} 학생은 최근 ${records.length}회의 수업 기록이 누적되어 있습니다. ${topWeakness ? `가장 자주 나타난 약점은 ${topWeakness[0]}이며 현재까지 ${topWeakness[1]}회 기록되었습니다.` : "아직 약점 태그는 기록되지 않았습니다."} 최근 수업에서는 "${records[0].weaknessNotes}"가 주요 관찰 내용으로 남았습니다.`;
}

function buildReportPlainText() {
  return [
    "학생 누적 분석 리포트",
    document.getElementById("reportMeta")?.innerText || "",
    `최근 학습 요약: ${document.getElementById("reportOverview")?.textContent || ""}`,
    `누적 학습 흐름: ${document.getElementById("reportProgress")?.textContent || ""}`,
    `학부모 공유 코멘트: ${document.getElementById("reportComment")?.textContent || ""}`
  ].join("\n\n");
}

function loadState() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return structuredClone(demoData);
  try {
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed.students) && Array.isArray(parsed.records) ? parsed : structuredClone(demoData);
  } catch {
    return structuredClone(demoData);
  }
}

function persist() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

async function initializeAppState() {
  const localState = loadState();
  if (!supabase) {
    replaceState(localState);
    return;
  }

  if (!currentUser) {
    replaceState({ students: [], records: [] });
    storageMode = "supabase";
    persist();
    ensureSelectedStudent();
    return;
  }

  try {
    const remoteState = await loadSupabaseState();
    if (!remoteState.students.length && localState.students.length && !localStorage.getItem(getUserSeedKey())) {
      await seedSupabase(localState);
      localStorage.setItem(getUserSeedKey(), "true");
      replaceState(localState);
      storageMode = "supabase";
      persist();
      ensureSelectedStudent();
      return;
    }

    if (remoteState.students.length || remoteState.records.length) {
      replaceState(remoteState);
      storageMode = "supabase";
    } else {
      replaceState(localState);
    }
  } catch (error) {
    console.error("Supabase load failed, using local cache instead.", error);
    replaceState(localState);
  }

  persist();
  ensureSelectedStudent();
}

function replaceState(nextState) {
  state.students = [...nextState.students];
  state.records = [...nextState.records];
}

function ensureSelectedStudent() {
  if (!state.students.some((student) => student.id === selectedStudentId)) {
    selectedStudentId = state.students[0]?.id || null;
  }
  syncSelectedStudent();
}

async function loadSupabaseState() {
  const [studentsResult, recordsResult, reviewsResult, reportsResult] = await Promise.all([
    supabase.from("students").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false }),
    supabase.from("lesson_records").select("*").eq("user_id", currentUser.id).order("lesson_date", { ascending: false }),
    supabase.from("review_recommendations").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false }),
    supabase.from("reports").select("*").eq("user_id", currentUser.id).order("created_at", { ascending: false })
  ]);

  if (studentsResult.error) throw studentsResult.error;
  if (recordsResult.error) throw recordsResult.error;
  if (reviewsResult.error) throw reviewsResult.error;
  if (reportsResult.error) throw reportsResult.error;

  reviewRecommendations = (reviewsResult.data || []).map(mapReviewFromDb);
  savedReports = (reportsResult.data || []).map(mapReportFromDb);

  return {
    students: (studentsResult.data || []).map(mapStudentFromDb),
    records: (recordsResult.data || []).map(mapRecordFromDb)
  };
}

async function seedSupabase(seedState) {
  const studentsPayload = seedState.students.map((student) => mapStudentToDb(student));
  const recordsPayload = seedState.records.map((record) => mapRecordToDb(record));

  if (studentsPayload.length) {
    const { error } = await supabase.from("students").upsert(studentsPayload, { onConflict: "id" });
    if (error) throw error;
  }

  if (recordsPayload.length) {
    const { error } = await supabase.from("lesson_records").upsert(recordsPayload, { onConflict: "id" });
    if (error) throw error;
  }
}

async function saveStudent(student) {
  if (!supabase || !currentUser) return;
  const { error } = await supabase.from("students").insert(mapStudentToDb(student));
  if (error) {
    console.error("Failed to save student to Supabase.", error);
    alert("학생 정보를 Supabase에 저장하지 못했어요.");
  }
}

async function saveLessonRecord(record) {
  if (!supabase || !currentUser) return;
  const { error } = await supabase.from("lesson_records").insert(mapRecordToDb(record));
  if (error) {
    console.error("Failed to save lesson record to Supabase.", error);
    alert("수업 기록을 Supabase에 저장하지 못했어요.");
  }
}

async function saveReviewRecommendation(review) {
  reviewRecommendations.unshift({
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...review
  });

  if (!supabase || !review.studentId || !currentUser) return;
  const payload = mapReviewToDb(reviewRecommendations[0]);
  const { error } = await supabase.from("review_recommendations").insert(payload);
  if (error) {
    console.error("Failed to save review recommendation to Supabase.", error);
  }
}

async function saveReportSnapshot(snapshot) {
  const report = {
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
    ...snapshot
  };
  savedReports.unshift(report);

  if (!supabase || !report.studentId || !currentUser) return report;
  const payload = mapReportToDb(report);
  const { error } = await supabase.from("reports").insert(payload);
  if (error) {
    console.error("Failed to save report to Supabase.", error);
    alert("리포트를 Supabase에 저장하지 못했어요.");
    return null;
  }
  return report;
}

async function deleteStudent(studentId) {
  if (!supabase || !currentUser) return;
  const { error } = await supabase.from("students").delete().eq("id", studentId).eq("user_id", currentUser.id);
  if (error) {
    console.error("Failed to delete student from Supabase.", error);
    alert("Supabase에서 학생 삭제에 실패했어요.");
  }
}

async function resetAllData() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(getUserSeedKey());
  state.students = [];
  state.records = [];
  reviewRecommendations = [];
  savedReports = [];
  if (!supabase || !currentUser) return;
  const recordsResult = await supabase.from("lesson_records").delete().eq("user_id", currentUser.id);
  if (recordsResult.error) console.error(recordsResult.error);
  const reviewsResult = await supabase.from("review_recommendations").delete().eq("user_id", currentUser.id);
  if (reviewsResult.error) console.error(reviewsResult.error);
  const reportsResult = await supabase.from("reports").delete().eq("user_id", currentUser.id);
  if (reportsResult.error) console.error(reportsResult.error);
  const studentsResult = await supabase.from("students").delete().eq("user_id", currentUser.id);
  if (studentsResult.error) console.error(studentsResult.error);
}

function mapStudentFromDb(row) {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject || "",
    grade: row.grade || "",
    schedule: row.schedule || "",
    parentNote: row.parent_note || "",
    focus: row.focus || ""
  };
}

function mapStudentToDb(student) {
  return {
    id: student.id,
    user_id: currentUser?.id || null,
    name: student.name,
    subject: student.subject,
    grade: student.grade,
    schedule: student.schedule,
    parent_note: student.parentNote,
    focus: student.focus
  };
}

function mapRecordFromDb(row) {
  return {
    id: row.id,
    studentId: row.student_id,
    date: row.lesson_date,
    understanding: row.understanding || "",
    lessonSummary: row.lesson_summary || "",
    homework: row.homework || "",
    weaknessNotes: row.weakness_notes || "",
    tags: Array.isArray(row.tags) ? row.tags : []
  };
}

function mapRecordToDb(record) {
  return {
    id: record.id,
    user_id: currentUser?.id || null,
    student_id: record.studentId,
    lesson_date: record.date,
    understanding: record.understanding,
    lesson_summary: record.lessonSummary,
    homework: record.homework,
    weakness_notes: record.weaknessNotes,
    tags: record.tags || []
  };
}

function mapReviewFromDb(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    studentId: row.student_id,
    sourceProblemText: row.source_problem_text || "",
    teacherNote: row.teacher_note || "",
    ocrText: row.ocr_text || "",
    summary: row.summary || "",
    recommendedProblems: Array.isArray(row.recommended_problems) ? row.recommended_problems : [],
    imageUrl: row.image_url || null
  };
}

function mapReviewToDb(review) {
  return {
    id: review.id,
    user_id: currentUser?.id || null,
    student_id: review.studentId,
    source_problem_text: review.sourceProblemText,
    teacher_note: review.teacherNote,
    ocr_text: review.ocrText,
    summary: review.summary,
    recommended_problems: review.recommendedProblems || [],
    image_url: review.imageUrl
  };
}

function getLatestSavedReport(studentId) {
  if (!studentId) return null;
  return savedReports.find((report) => report.studentId === studentId) || null;
}

function buildReportSnapshot(student, records, latest, weaknessStats) {
  return {
    studentId: student?.id || null,
    reportTitle: student ? `${student.name} 학생 누적 분석 리포트` : "학생 누적 분석 리포트",
    reportSummary: student && latest
      ? `${student.name} 학생은 현재 ${student.focus || "기초 학습 흐름 점검"}를 중심으로 수업을 이어가고 있습니다. 최근 수업에서는 ${latest.lessonSummary}`
      : "학생을 선택하면 이곳에 누적 학습 요약이 생성됩니다.",
    reportComment: latest
      ? `${student.name} 학생은 최근 ${records.length}회의 수업 기록을 통해 학습 흐름이 누적 관리되고 있습니다. 특히 ${latest.weaknessNotes} 부분을 중심으로 학습 경과를 살펴보고 있습니다.`
      : "학부모에게 전달할 요약 코멘트가 이곳에 생성됩니다.",
    weaknessSummary: Object.keys(weaknessStats).length
      ? Object.entries(weaknessStats).slice(0, 4).map(([tag, count]) => `${tag}: 총 ${count}회 기록되어 반복 관리가 필요한 영역입니다.`)
      : ["누적 데이터가 생기면 반복 약점이 정리됩니다."],
    reportData: {
      studentName: student?.name || "-",
      subject: student?.subject || "-",
      lessonCount: records.length,
      lastRecordDate: latest ? formatDate(latest.date) : "-",
      progress: records.length
        ? records.slice(0, 3).map((record) => `${formatDate(record.date)}에 ${record.lessonSummary}`).join(" ")
        : "학생 수업 기록이 아직 없습니다."
    }
  };
}

function applyReportSnapshot(snapshot) {
  document.getElementById("reportMeta").innerHTML = `
    <div class="report-meta-item"><strong>학생 이름</strong><span>${snapshot.reportData?.studentName || "-"}</span></div>
    <div class="report-meta-item"><strong>과목</strong><span>${snapshot.reportData?.subject || "-"}</span></div>
    <div class="report-meta-item"><strong>누적 수업 수</strong><span>${snapshot.reportData?.lessonCount || 0}회</span></div>
    <div class="report-meta-item"><strong>최근 기록일</strong><span>${snapshot.reportData?.lastRecordDate || "-"}</span></div>
  `;
  text("reportOverview", snapshot.reportSummary || "");
  text("reportProgress", snapshot.reportData?.progress || "");
  document.getElementById("reportWeaknessList").innerHTML = (snapshot.weaknessSummary || [])
    .map((item) => `<li>${item}</li>`)
    .join("");
  text("reportComment", snapshot.reportComment || "");
}

function mapReportFromDb(row) {
  return {
    id: row.id,
    createdAt: row.created_at,
    studentId: row.student_id,
    reportTitle: row.report_title || "",
    reportSummary: row.report_summary || "",
    reportComment: row.report_comment || "",
    weaknessSummary: normalizeWeaknessSummary(row.weakness_summary),
    reportData: row.report_data || {}
  };
}

function mapReportToDb(report) {
  return {
    id: report.id,
    user_id: currentUser?.id || null,
    student_id: report.studentId,
    report_title: report.reportTitle,
    report_summary: report.reportSummary,
    report_comment: report.reportComment,
    weakness_summary: Array.isArray(report.weaknessSummary) ? report.weaknessSummary.join("\n") : report.weaknessSummary,
    report_data: report.reportData || {}
  };
}

function normalizeWeaknessSummary(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === "string" && value.trim()) return value.split("\n").filter(Boolean);
  return [];
}

async function initializeAuth() {
  if (!supabase) return;
  const { data, error } = await supabase.auth.getUser();
  if (error) {
    console.error("Failed to fetch auth user.", error);
    currentUser = null;
    return;
  }
  currentUser = data?.user || null;
}

function renderAuthCard() {
  const shell = document.querySelector(".shell");
  if (!shell) return;
  const existing = document.getElementById("authCard");
  if (existing) existing.remove();

  const card = document.createElement("section");
  card.className = "auth-card no-print";
  card.id = "authCard";

  if (currentUser) {
    card.innerHTML = `
      <div>
        <h3>로그인 상태</h3>
        <p class="muted" id="authStateHint">${getCurrentUsername()} 계정으로 저장 중</p>
      </div>
      <div class="auth-actions">
        <span class="subject-pill">아이디 로그인</span>
        <button class="secondary-btn" id="signOutButton" type="button">로그아웃</button>
      </div>
    `;
  } else {
    card.innerHTML = `
      <div>
        <h3>개인정보 없이 로그인</h3>
        <p class="muted">실제 이메일 대신 아이디와 비밀번호만으로 계정을 만들고 사용할 수 있어요.</p>
      </div>
      <form id="authForm" class="auth-form">
        <label>아이디<input type="text" id="authUsername" placeholder="예: teacher01" required></label>
        <label>비밀번호<input type="password" id="authPassword" placeholder="비밀번호 입력" required></label>
        <div class="auth-actions">
          <button class="secondary-btn" id="signInButton" type="submit">로그인</button>
          <button class="primary-btn" id="signUpButton" type="button">회원가입</button>
        </div>
      </form>
    `;
  }

  shell.prepend(card);

  document.getElementById("authForm")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    await signInWithUsernamePassword();
  });
  document.getElementById("signUpButton")?.addEventListener("click", async () => {
    await signUpWithUsernamePassword();
  });
  document.getElementById("signOutButton")?.addEventListener("click", async () => {
    await supabase.auth.signOut();
    location.reload();
  });
}

async function signUpWithUsernamePassword() {
  if (!supabase) return;
  const username = value("authUsername");
  const password = value("authPassword");
  if (!username || !password) {
    alert("아이디와 비밀번호를 모두 입력해 주세요.");
    return;
  }
  const email = buildPseudoEmail(username);
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { display_name: username }
    }
  });
  if (error) {
    alert(`회원가입 실패: ${error.message}`);
    return;
  }
  alert("회원가입이 완료됐어요. 바로 로그인 상태로 전환되는지 확인해 주세요.");
  location.reload();
}

async function signInWithUsernamePassword() {
  if (!supabase) return;
  const username = value("authUsername");
  const password = value("authPassword");
  if (!username || !password) {
    alert("아이디와 비밀번호를 모두 입력해 주세요.");
    return;
  }
  const email = buildPseudoEmail(username);
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    alert(`로그인 실패: ${error.message}`);
    return;
  }
  location.reload();
}

function buildPseudoEmail(username) {
  const normalized = Array.from(username.trim())
    .map((char) => char.codePointAt(0).toString(16))
    .join("");
  return `user_${normalized}@classcare.app`;
}

function getCurrentUsername() {
  return currentUser?.user_metadata?.display_name || "로그인 사용자";
}

function requireAuthAction(showAlert = true) {
  if (currentUser) return true;
  if (showAlert) alert("먼저 아이디와 비밀번호로 로그인해 주세요.");
  return false;
}

function getUserSeedKey() {
  return `${SUPABASE_SEED_KEY}-${currentUser?.id || "guest"}`;
}

function syncSelectedStudent() {
  if (selectedStudentId) sessionStorage.setItem("classcare-selected-student", selectedStudentId);
}

function value(id) {
  return document.getElementById(id)?.value.trim() || "";
}

function text(id, content) {
  const node = document.getElementById(id);
  if (node) node.textContent = content;
}

function formatDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ko-KR", { year: "numeric", month: "short", day: "numeric" });
}

function formatDateTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("ko-KR", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function buildStudentCallName(name) {
  if (!name) return "얘";
  const baseName = name.length === 3 ? name.slice(1) : name;
  const lastChar = baseName[baseName.length - 1];
  const code = lastChar.charCodeAt(0);
  const isHangul = code >= 0xac00 && code <= 0xd7a3;
  if (!isHangul) return `${baseName}야`;
  const hasBatchim = (code - 0xac00) % 28 !== 0;
  return hasBatchim ? `${baseName}아` : `${baseName}야`;
}

function toFriendlyBanmal(text) {
  if (!text) return "";
  return text
    .replace(/했습니다\./g, "했어.")
    .replace(/했습니다/g, "했어")
    .replace(/되었습니다\./g, "됐어.")
    .replace(/되었습니다/g, "됐어")
    .replace(/발생했습니다\./g, "발생했어.")
    .replace(/발생했습니다/g, "발생했어")
    .replace(/정리했습니다\./g, "정리했어.")
    .replace(/정리했습니다/g, "정리했어")
    .replace(/복습했습니다\./g, "복습했어.")
    .replace(/복습했습니다/g, "복습했어")
    .replace(/확인했습니다\./g, "확인했어.")
    .replace(/확인했습니다/g, "확인했어")
    .replace(/어려워했습니다\./g, "어려워했어.")
    .replace(/어려워했습니다/g, "어려워했어")
    .replace(/걸렸습니다\./g, "걸렸어.")
    .replace(/걸렸습니다/g, "걸렸어")
    .replace(/있었습니다\./g, "있었어.")
    .replace(/있었습니다/g, "있었어");
}

function toHomeworkBanmal(text) {
  const normalized = toFriendlyBanmal(text);
  if (!normalized) return "";
  if (/[.!?]$/.test(normalized)) return `${normalized}`;
  return `${normalized}야.`;
}

async function copyText(content, buttonId, defaultLabel) {
  if (!content) return;
  const button = document.getElementById(buttonId);
  try {
    await navigator.clipboard.writeText(content);
    if (button) button.textContent = "복사 완료";
  } catch {
    if (button) button.textContent = "복사 실패";
  }
  setTimeout(() => {
    if (button) button.textContent = defaultLabel;
  }, 1600);
}

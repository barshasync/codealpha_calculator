(() => {
  "use strict";

  const valueDisplay = document.getElementById("currentValue");
  const expressionDisplay = document.getElementById("expressionLine");
  const previewDisplay = document.getElementById("previewLine");
  const keypad = document.querySelector(".keypad");
  const calculator = document.querySelector(".calculator");
  const historyList = document.getElementById("historyList");
  const themeToggle = document.getElementById("themeToggle");
  const clearHistoryButton = document.getElementById("clearHistory");

  let expression = "";
  let justCalculated = false;
  let showingError = false;
  let history = readStorage("little-calculations-history", []);

  function readStorage(key, fallback) {
    try {
      const parsed = JSON.parse(localStorage.getItem(key));
      return parsed ?? fallback;
    } catch {
      return fallback;
    }
  }
  function saveStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Storage may be unavailable. */ }
  }
  function setTheme(theme) {
    document.documentElement.dataset.theme = theme;
    themeToggle.setAttribute("aria-label", `Switch to ${theme === "dark" ? "light" : "dark"} theme`);
    saveStorage("little-calculations-theme", theme);
  }
  const savedTheme = readStorage("little-calculations-theme", "light");
  setTheme(savedTheme === "dark" ? "dark" : "light");

  function prettyExpression(source) {
    return source.replaceAll("*", "×").replaceAll("/", "÷").replaceAll("-", "−");
  }
  function formatNumber(number) {
    if (!Number.isFinite(number)) throw new Error("That number is too large.");
    if (Object.is(number, -0) || Math.abs(number) < 1e-12) number = 0;
    const rounded = Number(number.toPrecision(12));
    const string = String(rounded);
    if (string.length <= 15) return string;
    return rounded.toExponential(7).replace(/\.?(\d*?)0+e/, (_, digits) => `${digits ? `.${digits}` : ""}e`);
  }

  // Recursive descent parser: addition/subtraction, multiplication/division, unary signs, then percent.
  function evaluate(source) {
    const input = source.replaceAll("×", "*").replaceAll("÷", "/").replaceAll("−", "-").replace(/\s+/g, "");
    let position = 0;
    function parseExpression() {
      let value = parseTerm();
      while (input[position] === "+" || input[position] === "-") {
        const operator = input[position++];
        const right = parseTerm();
        value = operator === "+" ? value + right : value - right;
      }
      return value;
    }
    function parseTerm() {
      let value = parseUnary();
      while (input[position] === "*" || input[position] === "/") {
        const operator = input[position++];
        const right = parseUnary();
        if (operator === "/" && right === 0) throw new Error("Cannot divide by zero.");
        value = operator === "*" ? value * right : value / right;
      }
      return value;
    }
    function parseUnary() {
      if (input[position] === "+") { position++; return parseUnary(); }
      if (input[position] === "-") { position++; return -parseUnary(); }
      return parsePercent();
    }
    function parsePercent() {
      let value = parsePrimary();
      while (input[position] === "%") { position++; value /= 100; }
      return value;
    }
    function parsePrimary() {
      if (input[position] === "(") {
        position++;
        const value = parseExpression();
        if (input[position] !== ")") throw new Error("Incomplete expression.");
        position++;
        return value;
      }
      const rest = input.slice(position);
      const match = rest.match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
      if (!match) throw new Error("Enter a number to continue.");
      position += match[0].length;
      const number = Number(match[0]);
      if (!Number.isFinite(number)) throw new Error("That number is too large.");
      return number;
    }
    if (!input) throw new Error("Empty expression.");
    const result = parseExpression();
    if (position !== input.length) throw new Error("Incomplete expression.");
    if (!Number.isFinite(result)) throw new Error("That number is too large.");
    return result;
  }

  function canEvaluate(source) {
    if (!source || /[+\-*/.]$/.test(source)) return false;
    try { evaluate(source); return true; } catch { return false; }
  }
  function updateDisplay() {
    if (showingError) return;
    if (!expression) {
      valueDisplay.textContent = "0";
      expressionDisplay.innerHTML = "&nbsp;";
      previewDisplay.innerHTML = "&nbsp;";
      return;
    }
    const displayExpression = prettyExpression(expression);
    const endsWithNumber = /(?:\d|%|\.)$/.test(expression);
    if (justCalculated) {
      expressionDisplay.textContent = displayExpression;
      previewDisplay.innerHTML = "&nbsp;";
      return;
    }
    if (!endsWithNumber) {
      const lastOperator = expression.match(/[+\-*/]$/);
      const active = lastOperator ? expression.slice(0, -1) : expression;
      const activeValue = active && canEvaluate(active) ? formatNumber(evaluate(active)) : "0";
      valueDisplay.textContent = activeValue;
      expressionDisplay.textContent = displayExpression;
      previewDisplay.innerHTML = "&nbsp;";
      return;
    }
    const lastChunk = expression.match(/(?:\d+\.?\d*|\.\d+)%?$/)?.[0] ?? "0";
    valueDisplay.textContent = lastChunk;
    expressionDisplay.textContent = displayExpression;
    if (canEvaluate(expression)) {
      try { previewDisplay.textContent = `= ${formatNumber(evaluate(expression))}`; }
      catch { previewDisplay.innerHTML = "&nbsp;"; }
    } else previewDisplay.innerHTML = "&nbsp;";
  }
  function flashError(message) {
    showingError = true;
    valueDisplay.textContent = "Oops";
    expressionDisplay.textContent = message;
    previewDisplay.innerHTML = "&nbsp;";
    window.setTimeout(() => { showingError = false; updateDisplay(); }, 1100);
  }
  function clearAll() {
    expression = ""; justCalculated = false; showingError = false; updateDisplay();
  }
  function deleteLast() {
    if (showingError) { clearAll(); return; }
    if (justCalculated) { expression = ""; justCalculated = false; }
    else expression = expression.slice(0, -1);
    updateDisplay();
  }
  function appendDigit(digit) {
    if (showingError) clearAll();
    if (justCalculated) { expression = ""; justCalculated = false; }
    const currentNumber = expression.split(/[+\-*/]/).at(-1);
    if (digit === ".") {
      if (currentNumber.includes(".")) return;
      expression += currentNumber ? "." : "0.";
    } else if (digit === "00") {
      expression += currentNumber ? "00" : "0";
    } else expression += digit;
    updateDisplay();
  }
  function appendOperator(operator) {
    if (showingError) clearAll();
    if (!expression) {
      if (operator === "-") { expression = "-"; updateDisplay(); }
      return;
    }
    if (justCalculated) justCalculated = false;
    const last = expression.at(-1);
    if (/[+*/-]/.test(last)) {
      if (operator === "-" && last !== "-") expression += operator;
      else if (expression.length > 1 && /[+*/-]/.test(expression.at(-2)) && last === "-") expression = expression.slice(0, -2) + operator;
      else expression = expression.slice(0, -1) + operator;
    } else if (last !== ".") expression += operator;
    updateDisplay();
  }
  function appendPercent() {
    if (showingError) clearAll();
    if (justCalculated) justCalculated = false;
    if (expression && /(?:\d|%)$/.test(expression)) expression += "%";
    updateDisplay();
  }
  function addHistory(source, result) {
    history.unshift({ expression: prettyExpression(source), result });
    history = history.slice(0, 6);
    saveStorage("little-calculations-history", history);
    renderHistory();
  }
  function calculate() {
    if (showingError) { clearAll(); return; }
    if (!expression || /[+\-*/.]$/.test(expression)) { flashError("Finish the expression first"); return; }
    const completed = expression;
    try {
      const result = formatNumber(evaluate(completed));
      expressionDisplay.textContent = `${prettyExpression(completed)} =`;
      valueDisplay.textContent = result;
      previewDisplay.innerHTML = "&nbsp;";
      expression = result;
      justCalculated = true;
      addHistory(completed, result);
      calculator.classList.remove("is-complete");
      void calculator.offsetWidth;
      calculator.classList.add("is-complete");
    } catch (error) {
      flashError(error.message === "Cannot divide by zero." ? "Cannot divide by zero" : "Check that expression");
    }
  }
  function renderHistory() {
    historyList.replaceChildren();
    if (!history.length) {
      const empty = document.createElement("p");
      empty.className = "history-empty";
      empty.textContent = "Your calculations will find a home here.";
      historyList.append(empty);
      return;
    }
    history.forEach((item) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "history-item";
      button.setAttribute("aria-label", `${item.expression} equals ${item.result}. Reuse result`);
      const expressionText = document.createElement("span");
      expressionText.className = "history-expression";
      expressionText.textContent = item.expression;
      const resultText = document.createElement("span");
      resultText.className = "history-result";
      resultText.textContent = item.result;
      button.append(expressionText, resultText);
      button.addEventListener("click", () => {
        expression = item.result; justCalculated = false; showingError = false; updateDisplay();
      });
      historyList.append(button);
    });
  }

  keypad.addEventListener("click", (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    if (button.dataset.action === "clear") clearAll();
    else if (button.dataset.action === "delete") deleteLast();
    else if (button.dataset.action === "equals") calculate();
    else if (button.dataset.value === "%") appendPercent();
    else if (["+", "−", "×", "÷"].includes(button.dataset.value)) appendOperator(({ "−": "-", "×": "*", "÷": "/" })[button.dataset.value] ?? button.dataset.value);
    else appendDigit(button.dataset.value);
  });
  document.addEventListener("keydown", (event) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const key = event.key;
    if (/^[0-9]$/.test(key)) appendDigit(key);
    else if (key === ".") appendDigit(".");
    else if (["+", "-", "*", "/"].includes(key)) appendOperator(key);
    else if (key === "%") appendPercent();
    else if (key === "Enter" || key === "=") { event.preventDefault(); calculate(); }
    else if (key === "Backspace") { event.preventDefault(); deleteLast(); }
    else if (key === "Escape") { event.preventDefault(); clearAll(); }
  });
  themeToggle.addEventListener("click", () => setTheme(document.documentElement.dataset.theme === "dark" ? "light" : "dark"));
  clearHistoryButton.addEventListener("click", () => { history = []; saveStorage("little-calculations-history", history); renderHistory(); });
  renderHistory();
  updateDisplay();
})();



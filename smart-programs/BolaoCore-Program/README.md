# Edu Grants Smart Programs

# 🎓 Scholarship Smart Contract

This project implements a **scholarship management system** as a smart contract using Rust (`sails_rs`).  
It models the lifecycle of scholarships, from student registration to final closure of the process, while managing universities, investors, committees, and financial resources.

---

## 📌 Core Entities

- **Student**: Identified by a unique `matricula`. Stores CURP, birth certificate, prior certificate, address, CLABE, and attached documents.  
- **University**: Registered with a unique `RFC`.  
- **Committee**: Scholarship committee members, linked by CURP and student `matricula`.  
- **Investor**: Provides financial resources, identified by `RFC` and `CLABE`.  
- **Income**: Incoming funds from investors (RFC, amount, date).  
- **Expense**: Outgoing funds to students (matricula, amount, date, CLABE).  
- **ScholarshipProcess**: Tracks each student’s scholarship application and its current state.  

---

## 🔄 Process States

The lifecycle of a scholarship application is defined by `ProcessState`:

1. **Registered** → Student application is created.  
2. **InReview** → Documents and checklist are being validated.  
3. **Preliminary** → Preliminary results are published.  
4. **Appeal** → Students may file appeals.  
5. **Final** → Final results are issued.  
6. **Closed** → The process is officially closed.  

State transitions are strictly validated to avoid invalid flows.

---

## ⚙️ Main Functions

- **Registration**
  - `register_student` → Creates a new student and assigns a unique `matricula`.  
  - `register_university` → Adds a university with unique `RFC`.  
  - `register_committee` → Registers a committee member for a student.  
  - `register_investor` → Adds an investor with RFC and CLABE.  

- **Resource Management**
  - `add_income` → Adds an incoming financial resource.  
  - `add_expense` → Records an expense to a student (linked to matricula).  

- **Process Control**
  - `advance_process` → Moves a scholarship process to the next valid state.  
  - `add_documentation` → Attaches documents to a student’s process.  
  - `close_process` → Finalizes a scholarship once it has reached the `Final` state.  

- **Queries**
  - `query_student` → Fetches a student by `matricula`.  
  - `query_resources_by_matricula` → Returns incomes and expenses related to a student.  
  - `query_process_state` → Retrieves the process status and documents of a student.  
  - `query_state` → Returns a full snapshot of the contract state.  

---

## 📡 Events

The contract emits events to track actions:

- `StudentRegistered(matricula)`  
- `UniversityRegistered(university_id)`  
- `CommitteeRegistered(matricula)`  
- `InvestorRegistered(matricula)`  
- `IncomeAdded(rfc, amount)`  
- `ExpenseAdded(matricula, amount)`  
- `ProcessAdvanced(matricula, state)`  
- `DocumentationAdded(matricula)`  
- `ProcessClosed(matricula)`  
- `Error(message)`  

---

## 🗂️ Flow Summary

1. Students, universities, committee members, and investors are **registered**.  
2. Investors add **incomes**; students may receive **expenses**.  
3. A student’s scholarship process advances through states (`Registered → InReview → Preliminary → Appeal → Final → Closed`).  
4. Documentation can be attached at any stage.  
5. Once results are final, the process is **closed** and archived.  

---

## 🚀 Usage

- Initialize the contract with `seed()`.  
- Use the service methods to register entities, manage resources, and control the scholarship lifecycle.  
- Query states for audit, reporting, or exporting system data.  

---

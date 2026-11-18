const { onCall, onRequest, HttpsError } = require("firebase-functions/v2/https");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { randomUUID } = require("crypto");

initializeApp();
const db = getFirestore();

const HDFC_API_KEY = defineSecret("HDFC_API_KEY");
const HDFC_MERCHANT_ID = defineSecret("HDFC_MERCHANT_ID");
const HDFC_RESPONSE_KEY = defineSecret("HDFC_RESPONSE_KEY");
const HDFC_MODE = defineSecret("HDFC_MODE");

const EXAM_CELL_HDFC_API_KEY = defineSecret("EXAM_CELL_HDFC_API_KEY");
const EXAM_CELL_HDFC_MERCHANT_ID = defineSecret("EXAM_CELL_HDFC_MERCHANT_ID");
const EXAM_CELL_HDFC_RESPONSE_KEY = defineSecret("EXAM_CELL_HDFC_RESPONSE_KEY");
const EXAM_CELL_HDFC_MODE = defineSecret("EXAM_CELL_HDFC_MODE");

const HDFC_SECRETS = [
  HDFC_API_KEY,
  HDFC_MERCHANT_ID,
  HDFC_RESPONSE_KEY,
  HDFC_MODE,
  EXAM_CELL_HDFC_API_KEY,
  EXAM_CELL_HDFC_MERCHANT_ID,
  EXAM_CELL_HDFC_RESPONSE_KEY,
  EXAM_CELL_HDFC_MODE,
];

const SANDBOX_BASE = "https://smartgateway.hdfcuat.bank.in";
const PRODUCTION_BASE = "https://smartgateway.hdfc.bank.in";

function getConfig() {
  let apiKey = process.env.HDFC_API_KEY || "";
  let merchantId = process.env.HDFC_MERCHANT_ID || "";
  let responseKey = process.env.HDFC_RESPONSE_KEY || "";
  let mode = process.env.HDFC_MODE || "production";

  try {
    if (typeof HDFC_API_KEY !== "undefined" && HDFC_API_KEY.value) {
      const val = HDFC_API_KEY.value();
      if (val) apiKey = val;
    }
  } catch (_) {}

  try {
    if (typeof HDFC_MERCHANT_ID !== "undefined" && HDFC_MERCHANT_ID.value) {
      const val = HDFC_MERCHANT_ID.value();
      if (val) merchantId = val;
    }
  } catch (_) {}

  try {
    if (typeof HDFC_RESPONSE_KEY !== "undefined" && HDFC_RESPONSE_KEY.value) {
      const val = HDFC_RESPONSE_KEY.value();
      if (val) responseKey = val;
    }
  } catch (_) {}

  try {
    if (typeof HDFC_MODE !== "undefined" && HDFC_MODE.value) {
      const val = HDFC_MODE.value();
      if (val) mode = val;
    }
  } catch (_) {}

  const isSandbox = mode === "sandbox";
  const baseUrl = isSandbox ? SANDBOX_BASE : PRODUCTION_BASE;
  const basicAuth = Buffer.from(`${apiKey}:`).toString("base64");
  return { baseUrl, apiKey, merchantId, responseKey, basicAuth, isSandbox };
}

const isStaffName = (n) => !n || /master|admin|cashier|staff|super/i.test(String(n));

async function getExamCellConfig() {
  let apiKey = process.env.EXAM_CELL_HDFC_API_KEY || "";
  let merchantId = process.env.EXAM_CELL_HDFC_MERCHANT_ID || "";
  let responseKey = process.env.EXAM_CELL_HDFC_RESPONSE_KEY || "";
  let mode = process.env.EXAM_CELL_HDFC_MODE || "production";

  try {
    if (typeof EXAM_CELL_HDFC_API_KEY !== "undefined" && EXAM_CELL_HDFC_API_KEY.value) {
      const val = EXAM_CELL_HDFC_API_KEY.value();
      if (val) apiKey = val;
    }
  } catch (_) {}

  try {
    if (typeof EXAM_CELL_HDFC_MERCHANT_ID !== "undefined" && EXAM_CELL_HDFC_MERCHANT_ID.value) {
      const val = EXAM_CELL_HDFC_MERCHANT_ID.value();
      if (val) merchantId = val;
    }
  } catch (_) {}

  try {
    if (typeof EXAM_CELL_HDFC_RESPONSE_KEY !== "undefined" && EXAM_CELL_HDFC_RESPONSE_KEY.value) {
      const val = EXAM_CELL_HDFC_RESPONSE_KEY.value();
      if (val) responseKey = val;
    }
  } catch (_) {}

  try {
    if (typeof EXAM_CELL_HDFC_MODE !== "undefined" && EXAM_CELL_HDFC_MODE.value) {
      const val = EXAM_CELL_HDFC_MODE.value();
      if (val) mode = val;
    }
  } catch (_) {}

  if (!merchantId) {
    try {
      const gwSnap = await db.collection("exam_cell_settings").doc("gateway").get();
      if (gwSnap.exists) {
        const gwData = gwSnap.data();
        // Only non-sensitive parameters can fall back to Firestore.
        // Sensitive API and response keys MUST only come from Secret Manager or environment variables.
        if (gwData.merchantId) merchantId = gwData.merchantId;
        if (gwData.mode && !process.env.EXAM_CELL_HDFC_MODE) mode = gwData.mode;
      }
    } catch (e) {
      console.error("Error reading exam_cell_settings/gateway non-secret config from Firestore:", e);
    }
  }

  const isSandbox = mode === "sandbox";
  const baseUrl = isSandbox ? SANDBOX_BASE : PRODUCTION_BASE;
  const basicAuth = Buffer.from(`${apiKey}:`).toString("base64");
  return { baseUrl, apiKey, merchantId, responseKey, basicAuth, isSandbox };
}

function validateAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be logged in to make payments.");
  }
}

function generateOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomUUID().split("-")[0].toUpperCase();
  return `FEE${ts}${rand}`;
}

async function generateUniqueFeeReceiptNo(academicYear, paymentDate = new Date()) {
  const d = paymentDate instanceof Date ? paymentDate : (paymentDate && paymentDate.toDate ? paymentDate.toDate() : new Date(paymentDate || Date.now()));
  const validDate = isNaN(d.getTime()) ? new Date() : d;

  let ay = String(academicYear || "").trim();
  if (!ay) {
    const m = validDate.getMonth() + 1;
    const y = validDate.getFullYear();
    ay = m >= 6 ? `${y}-${y + 1}` : `${y - 1}-${y}`;
  }
  const cleanAy = ay.replace(/[^A-Za-z0-9-]/g, "");
  const mm = String(validDate.getMonth() + 1).padStart(2, "0");
  const dd = String(validDate.getDate()).padStart(2, "0");
  const mmdd = `${mm}${dd}`;

  const counterKey = `fee_receipt_${cleanAy}_${mmdd}`;
  const counterRef = db.collection("system_counters").doc(counterKey);

  let seq = 1;
  try {
    seq = await db.runTransaction(async (transaction) => {
      const docSnap = await transaction.get(counterRef);
      let nextSeq = 1;
      if (docSnap.exists) {
        nextSeq = (docSnap.data().lastSeq || 0) + 1;
      }
      transaction.set(counterRef, {
        lastSeq: nextSeq,
        ay: cleanAy,
        date: mmdd,
        updatedAt: Timestamp.now(),
      }, { merge: true });
      return nextSeq;
    });
  } catch (err) {
    console.error("Counter transaction error, using fallback count:", err);
    const existingCount = await db.collection("fee_receipts")
      .where("receiptNo", ">=", `FEE${cleanAy}-${mmdd}-`)
      .where("receiptNo", "<=", `FEE${cleanAy}-${mmdd}-\uf8ff`)
      .get()
      .then(s => s.size)
      .catch(() => 0);
    seq = existingCount + 1;
  }

  let candidateNo = `FEE${cleanAy}-${mmdd}-${String(seq).padStart(4, "0")}`;
  let attempts = 0;
  while (attempts < 50) {
    const [recSnap, paySnap] = await Promise.all([
      db.collection("fee_receipts").where("receiptNo", "==", candidateNo).limit(1).get().catch(() => ({ empty: true })),
      db.collection("fee_payments").where("receiptNo", "==", candidateNo).limit(1).get().catch(() => ({ empty: true })),
    ]);
    if (recSnap.empty && paySnap.empty) {
      break;
    }
    seq++;
    candidateNo = `FEE${cleanAy}-${mmdd}-${String(seq).padStart(4, "0")}`;
    attempts++;
  }

  return candidateNo;
}

exports.createPaymentSession = onCall(
  {
    cors: true,
    maxInstances: 20,
    concurrency: 40,
    enforceAppCheck: false,
    secrets: HDFC_SECRETS,
  },
  async (request) => {
    validateAuth(request);
    const { data } = request;
    const uid = (data.studentId && typeof data.studentId === "string" && data.studentId.trim()) ? data.studentId.trim() : request.auth.uid;
    const userEmail = data.studentEmail || request.auth.token.email || "";
    const rawPassedName = (!isStaffName(data.studentName) && data.studentName) ? String(data.studentName).trim() : "";

    const { amount, feeHead, returnUrl, academicYear: requestedYear } = data;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      throw new HttpsError("invalid-argument", "Valid amount is required.");
    }
    if (!feeHead || typeof feeHead !== "string") {
      throw new HttpsError("invalid-argument", "Fee head is required.");
    }
    if (!returnUrl || typeof returnUrl !== "string") {
      throw new HttpsError("invalid-argument", "Return URL is required.");
    }
    if (amount > 500000) {
      throw new HttpsError("invalid-argument", "Amount exceeds maximum limit of ₹5,00,000.");
    }

    // Backend validation of the amount (Request Tampering prevention)
    let userData = {};
    try {
      const userSnap = await db.collection("users").doc(uid).get();
      if (userSnap.exists) {
        userData = userSnap.data() || {};
      }
    } catch (uErr) {
      console.warn("User lookup warning:", uErr);
    }

    let programme = (data.programme || userData.programme || userData._profile_data?.programme || userData.course || "").trim();
    let batch = (data.batch || userData.batch || userData._profile_data?.batch || "").trim();
    let department = (data.department || userData.department || userData._profile_data?.department || userData.branch || "").trim();
    let regNo = (data.regNo || userData.regNo || userData.examNumber || userData.admissionNo || userData._profile_data?.regNo || "").trim();
    let userDisplayName = (!isStaffName(data.studentName) && data.studentName) ? String(data.studentName).trim() : "";
    if (!userDisplayName && !isStaffName(userData.displayName)) {
      userDisplayName = String(userData.displayName).trim();
    }
    if (!userDisplayName && !isStaffName(userData.studentName)) {
      userDisplayName = String(userData.studentName).trim();
    }

    // If programme or batch is still missing, attempt index lookup
    if ((!programme || !batch) && (regNo || uid)) {
      const lookupReg = regNo || (uid.length >= 6 ? uid : "");
      if (lookupReg) {
        try {
          const idxSnap = await db.collection("student_index").doc(lookupReg.replace(/[^a-zA-Z0-9]/g, "_")).get();
          if (idxSnap.exists) {
            const sDocId = idxSnap.data().studentDocId;
            if (sDocId) {
              const sSnap = await db.collection("students").doc(sDocId).get();
              if (sSnap.exists) {
                const sData = sSnap.data()._student_data?.[lookupReg] || sSnap.data();
                if (!programme) programme = (sData.programme || "").trim();
                if (!batch) batch = (sData.batch || "").trim();
                if (!department) department = (sData.department || "").trim();
                if (!userDisplayName && (sData.displayName || sData.studentName || sData.name)) {
                  userDisplayName = (sData.displayName || sData.studentName || sData.name || "").trim();
                }
              }
            }
          }
        } catch (lookupErr) {
          console.warn("student_index fallback warning:", lookupErr);
        }
      }
    }

    // Safe fallbacks to prevent blocking valid office/student payment
    if (!programme) programme = "UG";
    if (!batch) batch = "2026-2030";
    if (!userDisplayName || isStaffName(userDisplayName)) {
      userDisplayName = rawPassedName || "Student";
    }

    // Fetch configurations, previous payments, and student index in parallel
    const promises = [
      db.collection("fee_configurations").where("head", "==", feeHead).get(),
      db.collection("fee_payments").where("uid", "==", uid).where("feeHead", "==", feeHead).get()
    ];

    if (regNo) {
      const sanitizedReg = regNo.replace(/[^a-zA-Z0-9]/g, "_");
      promises.push(db.collection("student_index").doc(sanitizedReg).get());
    }

    const [feeConfigsSnap, previousPaymentsSnap, idxSnap] = await Promise.all(promises);

    // Fetch seat category (quota)
    let seatCategory = userData._profile_data?.quotaAskedFor || "";
    if (idxSnap && idxSnap.exists) {
      const sDocId = idxSnap.data().studentDocId;
      if (sDocId) {
        try {
          const sSnap = await db.collection("students").doc(sDocId).get();
          if (sSnap.exists) {
            const extra = sSnap.data()._student_data?.[regNo] || {};
            if (extra.quotaAskedFor) {
              seatCategory = extra.quotaAskedFor;
            }
          }
        } catch (err) {
          console.error("Error fetching seat category on backend:", err);
        }
      }
    }

    const normStudentProg = (programme || "").replace(/[_.\s]/g, '').toLowerCase();
    const normStudentDept = (department || "").replace(/[_.\s]/g, '').toLowerCase();
    const normStudentBatch = (batch || "").trim().toLowerCase();

    const matchingConfigs = [];
    const normReqHead = String(feeHead || '').trim().toLowerCase();
    feeConfigsSnap.forEach((doc) => {
      const data = doc.data();
      if (String(data.head || '').trim().toLowerCase() !== normReqHead) return;
      const normDataProg = (data.programme || "").replace(/[_.\s]/g, '').toLowerCase();
      const normDataDept = (data.department || "").replace(/[_.\s]/g, '').toLowerCase();
      const normDataBatch = (data.batch || "").trim().toLowerCase();

      const isProgMatch = normDataProg && normDataProg === normStudentProg;
      const isDeptMatch = !normDataDept || normDataDept === "all" || normDataDept === normStudentDept;
      const isBatchMatch = normDataBatch && normDataBatch === normStudentBatch;
      const isQuotaMatch = !seatCategory || !data.quota || data.quota === seatCategory;

      if (isProgMatch && isDeptMatch && isBatchMatch && isQuotaMatch) {
        matchingConfigs.push(data);
      }
    });

    if (!matchingConfigs.length && normReqHead === "transport fee") {
      const tPromises = [];
      if (regNo) {
        tPromises.push(db.collection("student_transport_applications").where("regNo", "==", regNo).get());
      }
      if (uid) {
        tPromises.push(db.collection("student_transport_applications").where("studentUid", "==", uid).get());
      }
      const tSnaps = await Promise.all(tPromises);
      const seenAppIds = new Set();
      tSnaps.forEach((tSnap) => {
        tSnap.forEach((doc) => {
          if (seenAppIds.has(doc.id)) return;
          seenAppIds.add(doc.id);
          const tData = doc.data();
          const amt = Number(tData.calculatedFee || tData.fee || 0);
          if (amt > 0) {
            matchingConfigs.push({
              head: "Transport Fee",
              academicYear: tData.academicYear || requestedYear || "2026-2027",
              amount: amt,
              id: doc.id
            });
          }
        });
      });
    }

    const hasAllocations = data.allocations && Array.isArray(data.allocations) && data.allocations.length > 0;
    if (!matchingConfigs.length && !hasAllocations) {
      throw new HttpsError("invalid-argument", `No fee configuration found for ${feeHead}.`);
    }

    // Year-aware outstanding: each payment reduces exactly ONE year's config
    // (tagged → that year, untagged legacy → oldest due first). Mirrors
    // src/utils/feeAllocation.js so portal validation matches portal display.
    const yearStartOf = (y) => Number(String(y || '').match(/^\d{4}/)?.[0] || 99999);
    const eqYear = (a, b) => String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
    const byYear = [...matchingConfigs].sort((a, b) => yearStartOf(a.academicYear) - yearStartOf(b.academicYear));

    const prevPayments = [];
    previousPaymentsSnap.forEach((doc) => {
      const data = doc.data();
      if (data.status === "SUCCESS") {
        const amt = Number(data.chargedAmount || data.amount || 0);
        if (amt > 0) {
          const ts = data.createdAt?.toMillis ? data.createdAt.toMillis() : new Date(data.createdAt || 0).getTime();
          prevPayments.push({ academicYear: data.academicYear || '', amount: amt, ts: isNaN(ts) ? 0 : ts });
        }
      }
    });
    prevPayments.sort((a, b) => a.ts - b.ts);

    const paidPerYear = new Map(); // year -> paid
    const remainingFor = (cfg) => Math.max(0, Number(cfg.amount || 0) - (paidPerYear.get(String(cfg.academicYear || '')) || 0));
    const addPaid = (year, v) => paidPerYear.set(year, (paidPerYear.get(year) || 0) + v);

    const untagged = [];
    prevPayments.forEach((p) => {
      const yr = String(p.academicYear || '').trim();
      const hit = yr ? byYear.find((c) => eqYear(c.academicYear, yr)) : null;
      if (hit) {
        addPaid(String(hit.academicYear || ''), p.amount);
      } else {
        untagged.push(p);
      }
    });
    untagged.forEach((p) => {
      let left = p.amount;
      for (const cfg of byYear) {
        if (left <= 0) break;
        const r = remainingFor(cfg);
        if (r <= 0) continue;
        const take = Math.min(r, left);
        addPaid(String(cfg.academicYear || ''), take);
        left -= take;
      }
      if (left > 0 && byYear.length) addPaid(String(byYear[0].academicYear || ''), left);
    });

    // Target year: requested year if configured, else earliest year with dues.
    let targetCfg = requestedYear
      ? byYear.find((c) => eqYear(c.academicYear, requestedYear))
      : null;
    if (!targetCfg) {
      targetCfg = byYear.find((c) => remainingFor(c) > 0) || byYear[0];
    }
    const targetYear = String(targetCfg?.academicYear || requestedYear || '2026-2027');
    const yearTotal = byYear.filter((c) => eqYear(c.academicYear, targetYear)).reduce((s, c) => s + (Number(c.amount) || 0), 0);
    const yearPaid = paidPerYear.get(targetYear) || 0;

    if (!hasAllocations && matchingConfigs.length > 0) {
      const maxAllowedPay = Math.max(0, yearTotal - yearPaid);
      if (amount > maxAllowedPay + 1) { // 1 rupee buffer for rounding
        throw new HttpsError("invalid-argument", `Requested amount ₹${amount} exceeds the outstanding balance of ₹${maxAllowedPay} for ${feeHead} (${targetYear || 'current year'}).`);
      }
    }

    const { baseUrl, merchantId, basicAuth, isSandbox } = getConfig();
    const orderId = generateOrderId();

    // Determine callback function URL dynamically to handle gateway POST redirects
    const projectId = process.env.GCLOUD_PROJECT || "outcomex";
    const region = "us-central1";
    let callbackUrl;
    if (process.env.FUNCTIONS_EMULATOR === "true") {
      callbackUrl = `http://127.0.0.1:5001/${projectId}/${region}/paymentCallback`;
    } else {
      callbackUrl = `https://${region}-${projectId}.cloudfunctions.net/paymentCallback`;
    }

    const payload = {
      order_id: orderId,
      amount: amount.toFixed(2),
      currency: "INR",
      customer_id: uid,
      customer_email: userEmail,
      customer_phone: data.phone || "",
      payment_page_client_id: merchantId,
      action: "paymentPage",
      return_url: callbackUrl,
      description: `Fee payment: ${feeHead}`,
      first_name: userDisplayName.split(" ")[0] || "Student",
      last_name: userDisplayName.split(" ").slice(1).join(" ") || "",
      source_object: "PAYMENT_LINK",
    };

    let response;
    try {
      response = await fetch(`${baseUrl}/session`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "x-merchantid": merchantId,
          "Content-Type": "application/json",
          version: "2023-06-30",
        },
        body: JSON.stringify(payload),
      });
    } catch (networkError) {
      console.error("HDFC network error:", networkError);
      throw new HttpsError("unavailable", "Payment gateway is temporarily unreachable. Please try again.");
    }

    let responseText = "";
    try {
      responseText = await response.text();
    } catch (readError) {
      console.error("HDFC response read error:", readError);
      throw new HttpsError("internal", "Could not read response from payment gateway.");
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`HDFC non-JSON response (status ${response.status}):`, responseText);
      throw new HttpsError("internal", `Payment gateway returned an invalid response format (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      const errMsg = responseData?.error_info?.developer_message
        || responseData?.error_message
        || responseData?.message
        || `Payment session creation failed (HTTP ${response.status})`;
      console.error("HDFC API error:", response.status, JSON.stringify(responseData));
      throw new HttpsError("failed-precondition", errMsg);
    }

    if (!responseData?.payment_links?.web) {
      console.error("HDFC missing payment_links:", JSON.stringify(responseData));
      throw new HttpsError("internal", "Payment gateway returned an invalid response.");
    }

    const paymentRecord = {
      orderId,
      uid,
      studentId: uid,
      studentEmail: userEmail,
      studentName: userDisplayName || userEmail,
      examNumber: regNo || "",
      programme: programme || "",
      department: department || "",
      batch: batch || "",
      feeHead,
      amount,
      currency: "INR",
      status: "PENDING",
      hdfcOrderId: responseData.id,
      paymentUrl: responseData.payment_links.web,
      paymentPageExpiry: responseData.order_expiry || null,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      environment: isSandbox ? "sandbox" : "production",
      returnUrl,
      isOnline: true,
      mode: "gateway",
      allocations: data.allocations || null,
    };

    try {
      await db.collection("fee_payments").doc(orderId).set(paymentRecord);
    } catch (dbError) {
      console.error("Firestore write error:", dbError);
    }

    return {
      success: true,
      orderId,
      paymentUrl: responseData.payment_links.web,
      expiresAt: responseData.order_expiry,
    };
  }
);

async function fulfillFeePaymentSuccess(orderId, gatewayData, options = {}) {
  const paymentRef = db.collection("fee_payments").doc(orderId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) {
    return { success: false, reason: "Payment record not found." };
  }
  const paymentRecord = paymentSnap.data();

  // Idempotency: If already SUCCESS and receipt exists, do not duplicate!
  let existingReceiptNo = paymentRecord.receiptNo || "";
  let receiptDocId = paymentRecord.receiptDocId || "";

  if (paymentRecord.status === "SUCCESS" && existingReceiptNo) {
    const existingRecSnap = await db.collection("fee_receipts").where("receiptNo", "==", existingReceiptNo).limit(1).get();
    if (!existingRecSnap.empty) {
      const existRec = existingRecSnap.docs[0].data();
      const pReg = String(paymentRecord.regNo || paymentRecord.examNumber || "").trim().toLowerCase();
      const rReg = String(existRec.regNo || existRec.examNumber || "").trim().toLowerCase();
      const pUid = String(paymentRecord.uid || paymentRecord.studentId || "").trim().toLowerCase();
      const rUid = String(existRec.uid || existRec.studentId || "").trim().toLowerCase();
      const isSameStudent = (pReg && rReg && pReg === rReg) || (pUid && rUid && pUid === rUid) || (!pReg && !rReg);
      if (isSameStudent || existRec.orderId === orderId || existRec.refNo === orderId) {
        return { success: true, alreadyProcessed: true, receiptNo: existingReceiptNo, orderId };
      }
      // If it belonged to a different student, reset existingReceiptNo so a genuine unique receipt is generated
      existingReceiptNo = "";
    }
  }

  const expectedAmount = Number(paymentRecord.amount || paymentRecord.chargedAmount || 0);
  const responseAmount = parseFloat(gatewayData.amount || expectedAmount || 0);
  const gatewayCurrency = String(gatewayData.currency || "INR").toUpperCase().trim();

  // Strict Request & Amount Tampering Protection
  if (gatewayCurrency !== "INR") {
    console.error(`Currency mismatch for order ${orderId}: expected INR, got ${gatewayCurrency}`);
    await paymentRef.update({
      currencyMismatch: true,
      gatewayCurrency,
      hdfcStatus: gatewayData.status || "",
      reviewRequired: true,
      updatedAt: Timestamp.now(),
    });
    return { success: false, reviewRequired: true, reason: `Currency mismatch: expected INR, got ${gatewayCurrency}` };
  }

  if (expectedAmount > 0 && Math.abs(responseAmount - expectedAmount) > 0.01) {
    console.error(`Amount mismatch for order ${orderId}: expected ₹${expectedAmount}, got ₹${responseAmount}`);
    await paymentRef.update({
      amountMismatch: true,
      expectedAmount,
      gatewayAmount: responseAmount,
      hdfcStatus: gatewayData.status || "",
      reviewRequired: true,
      updatedAt: Timestamp.now(),
    });
    return { success: false, reviewRequired: true, reason: `Amount mismatch: expected ₹${expectedAmount}, got ₹${responseAmount}` };
  }

  const pg = gatewayData.payment_gateway_response || {};
  const txnId = pg.txn_id || pg.epg_txn_id || gatewayData.txn_id || gatewayData.id || "";
  const rrn = pg.rrn || gatewayData.rrn || "";

  // Guaranteed genuine student name resolution — never fall back to logged-in admin/cashier
  let studentName = paymentRecord.studentName || "";
  if (isStaffName(studentName)) {
    const reg = paymentRecord.examNumber || paymentRecord.regNo;
    if (reg) {
      try {
        const idxSnap = await db.collection("student_index").doc(reg.replace(/[^a-zA-Z0-9]/g, "_")).get();
        if (idxSnap.exists) {
          const sDocId = idxSnap.data().studentDocId;
          if (sDocId) {
            const sSnap = await db.collection("students").doc(sDocId).get();
            if (sSnap.exists) {
              const sData = sSnap.data()._student_data?.[reg] || sSnap.data();
              const candName = sData.displayName || sData.studentName || sData.name;
              if (!isStaffName(candName)) studentName = candName;
            }
          }
        }
      } catch (_) {}
    }
    if (isStaffName(studentName) && paymentRecord.uid) {
      try {
        const uSnap = await db.collection("users").doc(paymentRecord.uid).get();
        if (uSnap.exists) {
          const uData = uSnap.data();
          const cleanUName = uData.displayName || uData.studentName || uData.name;
          if (!isStaffName(cleanUName)) studentName = cleanUName;
        }
      } catch (_) {}
    }
  }
  if (isStaffName(studentName)) studentName = "Student";

  let receiptNo = existingReceiptNo;
  if (!receiptNo) {
    receiptNo = await generateUniqueFeeReceiptNo(paymentRecord.academicYear, paymentRecord.paymentDate);
  }

  const updateData = {
    status: "SUCCESS",
    hdfcStatus: gatewayData.status || "CHARGED",
    chargedAmount: responseAmount,
    receiptNo,
    verifiedAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
    gatewayResponse: {
      rrn,
      txnId,
      epgTxnId: pg.epg_txn_id || "",
      authCode: pg.auth_id_code || "",
      respCode: pg.resp_code || "",
      respMessage: pg.resp_message || "",
      status: gatewayData.status || "",
    },
  };
  if (studentName) updateData.studentName = studentName;
  if (options.auditSource) updateData.fulfillmentSource = options.auditSource;

  if (paymentRecord.allocations && Array.isArray(paymentRecord.allocations) && paymentRecord.allocations.length > 1) {
    const allocs = paymentRecord.allocations;
    updateData.feeHead = allocs[0].feeHead || allocs[0].head || paymentRecord.feeHead;
    updateData.amount = Number(allocs[0].allocatedAmount || allocs[0].amount);
    updateData.chargedAmount = Number(allocs[0].allocatedAmount || allocs[0].amount);
    if (allocs[0].academicYear) updateData.academicYear = allocs[0].academicYear;

    await paymentRef.update(updateData);

    for (let i = 1; i < allocs.length; i++) {
      const alloc = allocs[i];
      const subAmt = Number(alloc.allocatedAmount || alloc.amount || 0);
      if (subAmt <= 0) continue;
      const subOrderId = `${orderId}_${i + 1}`;
      await db.collection("fee_payments").doc(subOrderId).set({
        ...paymentRecord,
        ...updateData,
        orderId: subOrderId,
        parentOrderId: orderId,
        feeHead: alloc.feeHead || alloc.head,
        academicYear: alloc.academicYear || paymentRecord.academicYear || "",
        amount: subAmt,
        chargedAmount: subAmt,
        status: "SUCCESS",
        verifiedAt: Timestamp.now(),
        updatedAt: Timestamp.now(),
      }, { merge: true });
    }
  } else {
    await paymentRef.update(updateData);
  }

  // Ensure idempotent receipt record in fee_receipts
  let existingReceiptSnap = await db.collection("fee_receipts").where("refNo", "==", orderId).limit(1).get();
  if (existingReceiptSnap.empty) {
    existingReceiptSnap = await db.collection("fee_receipts").where("orderId", "==", orderId).limit(1).get();
  }
  if (existingReceiptSnap.empty && existingReceiptNo) {
    const candSnap = await db.collection("fee_receipts").where("receiptNo", "==", existingReceiptNo).limit(1).get();
    if (!candSnap.empty) {
      const cData = candSnap.docs[0].data();
      const pReg = String(paymentRecord.regNo || paymentRecord.examNumber || "").trim().toLowerCase();
      const cReg = String(cData.regNo || cData.examNumber || "").trim().toLowerCase();
      const pUid = String(paymentRecord.uid || paymentRecord.studentId || "").trim().toLowerCase();
      const cUid = String(cData.uid || cData.studentId || "").trim().toLowerCase();
      if ((pReg && cReg && pReg === cReg) || (pUid && cUid && pUid === cUid) || (!cReg && !pReg) || cData.orderId === orderId || cData.refNo === orderId) {
        existingReceiptSnap = candSnap;
      }
    }
  }

  if (existingReceiptSnap.empty) {
    const receiptRecord = {
      orderId,
      uid: paymentRecord.uid || paymentRecord.studentId || "",
      studentId: paymentRecord.studentId || paymentRecord.uid || "",
      examNumber: paymentRecord.examNumber || paymentRecord.regNo || "",
      regNo: paymentRecord.regNo || paymentRecord.examNumber || "",
      studentName: studentName || "Student",
      programme: paymentRecord.programme || "UG",
      department: paymentRecord.department || "",
      batch: paymentRecord.batch || "",
      amount: responseAmount,
      status: "active",
      mode: paymentRecord.mode || "gateway",
      feeHead: paymentRecord.feeHead || "No Due Fee",
      academicYear: paymentRecord.academicYear || "2026-2027",
      remarks: paymentRecord.remarks || `HDFC SmartGateway Payment ${orderId}`,
      refNo: orderId,
      receiptNo,
      paymentDate: paymentRecord.paymentDate || Timestamp.now(),
      createdAt: Timestamp.now(),
      cancelledAt: null,
      reason: null,
      reprintCount: 0,
      bankRrn: rrn,
      txnId,
      items: (paymentRecord.allocations && Array.isArray(paymentRecord.allocations) && paymentRecord.allocations.length > 0)
        ? paymentRecord.allocations.map(a => ({
            head: a.feeHead || a.head,
            amount: a.allocatedAmount || a.amount
          }))
        : [{ head: paymentRecord.feeHead || "No Due Fee", amount: responseAmount }]
    };
    const recDocRef = db.collection("fee_receipts").doc(`REC_${orderId}`);
    await recDocRef.set({ ...receiptRecord, id: `REC_${orderId}` }, { merge: true });
    receiptDocId = `REC_${orderId}`;
    await paymentRef.update({ receiptDocId }).catch(() => {});
  } else {
    receiptDocId = existingReceiptSnap.docs[0].id;
  }

  if (options.auditSource) {
    try {
      await db.collection("payment_audit_logs").add({
        orderId,
        merchantId: "76980",
        action: "FULFILLMENT_SUCCESS",
        source: options.auditSource,
        adminUid: options.adminUid || null,
        amount: responseAmount,
        rrn,
        txnId,
        receiptNo,
        timestamp: Timestamp.now(),
      });
    } catch (_) {}
  }

  return { success: true, orderId, receiptNo, receiptDocId, amount: responseAmount };
}

async function fulfillExamCellPaymentSuccess(orderId, gatewayData, options = {}) {
  const paymentRef = db.collection("exam_cell_payments").doc(orderId);
  const paymentSnap = await paymentRef.get();
  if (!paymentSnap.exists) {
    return { success: false, reason: "Exam payment record not found." };
  }
  const paymentRecord = paymentSnap.data();

  // Idempotency: If already SUCCESS and receipt exists, do not duplicate!
  if (paymentRecord.status === "SUCCESS" && paymentRecord.receiptNo) {
    return { success: true, alreadyProcessed: true, receiptNo: paymentRecord.receiptNo, orderId };
  }

  const expectedAmount = Number(paymentRecord.amount || paymentRecord.chargedAmount || 0);
  const responseAmount = parseFloat(gatewayData.amount || expectedAmount || 0);
  const gatewayCurrency = String(gatewayData.currency || "INR").toUpperCase().trim();

  // Strict Request & Amount Tampering Protection
  if (gatewayCurrency !== "INR") {
    console.error(`Currency mismatch for exam order ${orderId}: expected INR, got ${gatewayCurrency}`);
    await paymentRef.update({
      currencyMismatch: true,
      gatewayCurrency,
      hdfcStatus: gatewayData.status || "",
      reviewRequired: true,
      updatedAt: Timestamp.now(),
    });
    return { success: false, reviewRequired: true, reason: `Currency mismatch: expected INR, got ${gatewayCurrency}` };
  }

  if (expectedAmount > 0 && Math.abs(responseAmount - expectedAmount) > 0.01) {
    console.error(`Amount mismatch for exam order ${orderId}: expected ₹${expectedAmount}, got ₹${responseAmount}`);
    await paymentRef.update({
      amountMismatch: true,
      expectedAmount,
      gatewayAmount: responseAmount,
      hdfcStatus: gatewayData.status || "",
      reviewRequired: true,
      updatedAt: Timestamp.now(),
    });
    return { success: false, reviewRequired: true, reason: `Amount mismatch: expected ₹${expectedAmount}, got ₹${responseAmount}` };
  }

  const pg = gatewayData.payment_gateway_response || {};
  const txnId = pg.txn_id || pg.epg_txn_id || gatewayData.txn_id || gatewayData.id || orderId;
  const rrn = pg.rrn || gatewayData.rrn || "";
  const catLower = (paymentRecord.category || "").toLowerCase();
  const receiptNo = paymentRecord.receiptNo || (catLower.includes("ese") ? `REC-ESE-${orderId}` : `REC-EXAM-${orderId}`);

  // Guaranteed genuine student name resolution — never fall back to logged-in admin/cashier
  let studentName = paymentRecord.studentName || "";
  if (isStaffName(studentName)) {
    const reg = paymentRecord.examNumber || paymentRecord.regNo;
    if (reg) {
      try {
        const idxSnap = await db.collection("student_index").doc(reg.replace(/[^a-zA-Z0-9]/g, "_")).get();
        if (idxSnap.exists) {
          const sDocId = idxSnap.data().studentDocId;
          if (sDocId) {
            const sSnap = await db.collection("students").doc(sDocId).get();
            if (sSnap.exists) {
              const sData = sSnap.data()._student_data?.[reg] || sSnap.data();
              const candName = sData.displayName || sData.studentName || sData.name;
              if (!isStaffName(candName)) studentName = candName;
            }
          }
        }
      } catch (_) {}
    }
    if (isStaffName(studentName) && paymentRecord.uid) {
      try {
        const uSnap = await db.collection("users").doc(paymentRecord.uid).get();
        if (uSnap.exists) {
          const uData = uSnap.data();
          const cleanUName = uData.displayName || uData.studentName || uData.name;
          if (!isStaffName(cleanUName)) studentName = cleanUName;
        }
      } catch (_) {}
    }
  }
  if (isStaffName(studentName)) studentName = "Student";

  // If already SUCCESS and registered, do not duplicate
  if (paymentRecord.status === "SUCCESS" && paymentRecord.receiptNo) {
    return { success: true, alreadyProcessed: true, receiptNo: paymentRecord.receiptNo, orderId };
  }

  await paymentRef.update({
    status: "SUCCESS",
    hdfcStatus: gatewayData.status || "CHARGED",
    chargedAmount: responseAmount,
    receiptNo,
    studentName,
    updatedAt: Timestamp.now(),
    verifiedAt: Timestamp.now(),
    gatewayResponse: {
      rrn,
      txnId,
      status: gatewayData.status || "",
    },
    fulfillmentSource: options.auditSource || "system",
  });

  let targetAppId = options.appId || paymentRecord.appId;
  let targetCollection = "photocopy_applications";
  if (catLower.includes("review")) {
    targetCollection = "review_applications";
  } else if (catLower.includes("revaluation")) {
    targetCollection = "revaluation_applications";
  } else if (catLower.includes("ese")) {
    targetCollection = "ese_fee_registrations";
  }

  if (!targetAppId) {
    try {
      let appSnap = await db.collection(targetCollection).where("orderId", "==", orderId).limit(1).get();
      if (appSnap.empty) {
        for (const col of ["ese_fee_registrations", "review_applications", "revaluation_applications", "photocopy_applications"]) {
          if (col !== targetCollection) {
            appSnap = await db.collection(col).where("orderId", "==", orderId).limit(1).get();
            if (!appSnap.empty) {
              targetCollection = col;
              break;
            }
          }
        }
      }
      if (!appSnap.empty) {
        targetAppId = appSnap.docs[0].id;
      }
    } catch (err) {
      console.error("Error finding application by orderId:", err);
    }
  }

  if (targetAppId) {
    try {
      const appRef = db.collection(targetCollection).doc(targetAppId);
      const appSnap = await appRef.get();
      if (appSnap.exists) {
        const currentAppData = appSnap.data() || {};
        const paidTimestamp = Timestamp.now();
        const electronicBill = {
          receiptNo,
          orderId,
          transactionId: txnId,
          rrn,
          amount: responseAmount,
          paidAt: new Date().toISOString(),
          paymentGateway: "HDFC SmartGateway (Exam Cell Account #76983)",
          paymentStatus: "Paid",
          billAttached: true,
        };

        const updateFields = {
          orderId,
          paymentStatus: "Paid",
          billAttached: true,
          transactionId: txnId,
          rrn,
          receiptNo,
          paidAt: paidTimestamp,
          electronicBill,
          updatedAt: paidTimestamp,
        };

        if (!currentAppData.status || currentAppData.status === "Payment Pending" || currentAppData.status === "Applied") {
          updateFields.status = targetCollection === "ese_fee_registrations" ? "Paid" : "Submitted to HOD";
        }

        await appRef.update(updateFields);

        if (targetCollection === "ese_fee_registrations") {
          await db.collection("ese_fee_payments").doc(orderId).set({
            ...currentAppData,
            ...updateFields,
            registrationId: targetAppId,
            studentName: currentAppData.studentName || paymentRecord.studentName || "Student",
            regNo: currentAppData.regNo || paymentRecord.examNumber || "",
            department: currentAppData.department || paymentRecord.department || "",
            feeAmount: responseAmount,
          }, { merge: true });
        }
      }
    } catch (err) {
      console.error("Failed to update application payment status:", err);
    }
  }

  if (options.auditSource) {
    try {
      await db.collection("payment_audit_logs").add({
        orderId,
        merchantId: "76983",
        action: "FULFILLMENT_SUCCESS",
        source: options.auditSource,
        adminUid: options.adminUid || null,
        amount: responseAmount,
        rrn,
        txnId,
        receiptNo,
        timestamp: Timestamp.now(),
      });
    } catch (_) {}
  }

  return { success: true, orderId, receiptNo, amount: responseAmount };
}

exports.verifyPayment = onCall(
  {
    cors: true,
    maxInstances: 20,
    concurrency: 40,
    enforceAppCheck: false,
    secrets: HDFC_SECRETS,
  },
  async (request) => {
    validateAuth(request);
    const { data } = request;

    const { orderId } = data;

    if (!orderId || typeof orderId !== "string") {
      throw new HttpsError("invalid-argument", "Order ID is required.");
    }

    // Fetch the original payment record from Firestore first
    const paymentRef = db.collection("fee_payments").doc(orderId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
      throw new HttpsError("not-found", "Payment record not found.");
    }
    const paymentRecord = paymentSnap.data();

    // Prevent double processing if the transaction was already successful
    if (paymentRecord.status === "SUCCESS") {
      return {
        success: true,
        status: "SUCCESS",
        hdfcStatus: paymentRecord.hdfcStatus,
        amount: paymentRecord.chargedAmount || paymentRecord.amount,
        orderId,
      };
    }

    const { baseUrl, merchantId, basicAuth } = getConfig();

    let response;
    try {
      response = await fetch(`${baseUrl}/orders/${orderId}`, {
        method: "GET",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "x-merchantid": merchantId,
          "x-customerid": request.auth.uid,
          "Content-Type": "application/json",
          version: "2023-06-30",
        },
      });
    } catch (networkError) {
      console.error("HDFC verify network error:", networkError);
      throw new HttpsError("unavailable", "Payment gateway is temporarily unreachable.");
    }

    let responseText = "";
    try {
      responseText = await response.text();
    } catch (readError) {
      console.error("HDFC response read error:", readError);
      throw new HttpsError("internal", "Could not read response from payment gateway.");
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      console.error(`HDFC non-JSON response (status ${response.status}):`, responseText);
      throw new HttpsError("internal", `Payment gateway returned an invalid response format (HTTP ${response.status}).`);
    }

    console.log(`HDFC status response for order ${orderId}:`, JSON.stringify(responseData));

    if (!response.ok) {
      const errMsg = responseData?.error_info?.developer_message || "Payment verification failed";
      console.error("HDFC verify error:", response.status, JSON.stringify(responseData));
      throw new HttpsError("internal", errMsg);
    }

    const hdfcStatus = responseData.status;
    let localStatus = "PENDING";
    let isTampered = false;

    if (hdfcStatus === "CHARGED") {
      // Validate that the charged amount matches the requested amount (Request Tampering validation)
      const responseAmount = parseFloat(responseData.amount || 0);
      const originalAmount = parseFloat(paymentRecord.amount || 0);
      if (Math.abs(responseAmount - originalAmount) > 0.01) {
        console.error(`Request Tampering detected for order ${orderId}: Expected ₹${originalAmount}, but got ₹${responseAmount}`);
        localStatus = "FAILED";
        isTampered = true;
      } else {
        localStatus = "SUCCESS";
      }
    } else if (["FAILED", "EXPIRED", "VOID", "JUSPAY_DECLINED", "AUTHENTICATION_FAILED", "AUTHORIZATION_FAILED", "CANCELLED", "DECLINED"].includes(hdfcStatus)) {
      localStatus = "FAILED";
    } else if (["PENDING", "STARTED", "NEW", "AUTHORIZING"].includes(hdfcStatus)) {
      // Never mark FAILED prematurely simply because time has elapsed without a redirect
      localStatus = "PENDING";
    }

    const updateData = {
      hdfcStatus,
      status: localStatus,
      updatedAt: Timestamp.now(),
      verifiedAt: Timestamp.now(),
    };

    if (isTampered) {
      updateData.tampered = true;
    }

    let txnId = "";
    if (responseData.payment_gateway_response) {
      const pg = responseData.payment_gateway_response;
      txnId = pg.txn_id || pg.epg_txn_id || "";
      updateData.gatewayResponse = {
        rrn: pg.rrn || "",
        txnId: txnId,
        epgTxnId: pg.epg_txn_id || "",
        authCode: pg.auth_id_code || "",
        respCode: pg.resp_code || "",
        respMessage: pg.resp_message || "",
      };
    }

    // Duplicate transaction validation (replay prevention)
    let isDuplicate = false;
    if (localStatus === "SUCCESS" && txnId) {
      try {
        const duplicateSnap = await db.collection("fee_payments")
          .where("gatewayResponse.txnId", "==", txnId)
          .where("status", "==", "SUCCESS")
          .get();

        duplicateSnap.forEach((doc) => {
          if (doc.id !== orderId) {
            isDuplicate = true;
          }
        });
      } catch (err) {
        console.error("Duplicate transaction query failed:", err);
      }

      if (isDuplicate) {
        console.error(`Duplicate entry check failed for order ${orderId}: txnId ${txnId} already processed.`);
        localStatus = "FAILED";
        updateData.status = "FAILED";
        updateData.duplicateDetected = true;
      }
    }

    if (localStatus === "SUCCESS" && !isDuplicate && !isTampered) {
      await fulfillFeePaymentSuccess(orderId, responseData, { auditSource: "verifyPayment_callable" });
    } else {
      await db.collection("fee_payments").doc(orderId).update(updateData).catch((err) => console.error("Firestore update error:", err));
    }

    return {
      success: localStatus === "SUCCESS",
      status: localStatus,
      hdfcStatus,
      amount: parseFloat(responseData.amount || 0),
      orderId,
      tampered: isTampered,
      duplicate: isDuplicate,
    };
  }
);

function sendRedirectResponse(res, targetUrl) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Payment Completed - Returning to Portal...</title>
  <style>
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background: #f8fafc;
      color: #0f172a;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 20px;
    }
    .card {
      background: #ffffff;
      padding: 36px 28px;
      border-radius: 20px;
      box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.1), 0 8px 10px -6px rgba(0, 0, 0, 0.1);
      max-width: 440px;
      width: 100%;
      text-align: center;
      border: 1px solid #e2e8f0;
    }
    .icon-container {
      width: 56px;
      height: 56px;
      background: #eff6ff;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      margin: 0 auto 20px;
    }
    .spinner {
      width: 28px;
      height: 28px;
      border: 3px solid #cbd5e1;
      border-top-color: #2563eb;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
    h2 { font-size: 20px; font-weight: 800; margin: 0 0 8px; color: #1e293b; }
    p { font-size: 14px; color: #64748b; margin: 0 0 24px; line-height: 1.5; }
    .btn {
      display: inline-block;
      width: 100%;
      padding: 12px 20px;
      background: #1e1b4b;
      color: #ffffff;
      font-weight: 700;
      font-size: 14px;
      border-radius: 12px;
      text-decoration: none;
      transition: all 0.2s ease;
      box-shadow: 0 4px 6px -1px rgba(30, 27, 75, 0.2);
    }
    .btn:hover { background: #312e81; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon-container">
      <div class="spinner"></div>
    </div>
    <h2>Payment Gateway Response Received</h2>
    <p>Redirecting you safely back to the OBE Portal...</p>
    <a id="redirectBtn" href="${targetUrl}" class="btn">Return to Portal Now &rarr;</a>
  </div>
  <script>
    setTimeout(function() {
      window.location.href = "${targetUrl}";
    }, 100);
  </script>
</body>
</html>`;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.status(200).send(html);
}

exports.paymentCallback = onRequest(
  {
    cors: true,
    secrets: HDFC_SECRETS,
  },
  async (req, res) => {
    const orderId = req.body?.order_id || req.query?.order_id || req.body?.orderId || req.query?.orderId || "";

    console.log(`paymentCallback: Received return for order ${orderId}`);

    let redirectUrl = "https://outcomex.web.app/student/fees"; // Default fallback

    if (orderId) {
      try {
        const docSnap = await db.collection("fee_payments").doc(orderId).get();
        if (docSnap.exists) {
          const data = docSnap.data();
          if (data.returnUrl) {
            redirectUrl = data.returnUrl;
          }
        }

        // Proactive server-side check before returning browser redirect
        const { baseUrl, merchantId, basicAuth } = getConfig();
        if (basicAuth && merchantId) {
          const gwRes = await fetch(`${baseUrl}/orders/${orderId}`, {
            method: "GET",
            headers: {
              Authorization: `Basic ${basicAuth}`,
              "x-merchantid": merchantId,
              "Content-Type": "application/json",
              version: "2023-06-30",
            },
          });
          if (gwRes.ok) {
            const gwData = await gwRes.json();
            if (gwData.status === "CHARGED") {
              await fulfillFeePaymentSuccess(orderId, gwData, { auditSource: "browser_callback" });
              console.log(`paymentCallback: Order ${orderId} verified and fulfilled on server.`);
            }
          }
        }
      } catch (err) {
        console.error("Error in paymentCallback verification:", err);
      }
    }

    console.log(`paymentCallback: Redirecting client to: ${redirectUrl}`);

    if (orderId) {
      const connector = redirectUrl.includes("?") ? "&" : "?";
      redirectUrl = `${redirectUrl}${connector}order_id=${orderId}`;
    }
    sendRedirectResponse(res, redirectUrl);
  }
);

function generateExamOrderId() {
  const ts = Date.now().toString(36).toUpperCase();
  const rand = randomUUID().split("-")[0].toUpperCase();
  return `EXAM${ts}${rand}`;
}

exports.createExamCellPaymentSession = onCall(
  {
    cors: true,
    maxInstances: 20,
    concurrency: 40,
    enforceAppCheck: false,
    secrets: HDFC_SECRETS,
  },
  async (request) => {
    validateAuth(request);
    const { data } = request;
    const uid = (data.studentId && typeof data.studentId === "string" && data.studentId.trim()) ? data.studentId.trim() : request.auth.uid;
    const userEmail = data.studentEmail || request.auth.token.email || "";
    const rawPassedName = (!isStaffName(data.studentName) && data.studentName) ? String(data.studentName).trim() : "";

    let userDisplayName = rawPassedName;
    if (!userDisplayName && uid) {
      try {
        const uSnap = await db.collection("users").doc(uid).get();
        if (uSnap.exists) {
          const uData = uSnap.data();
          const cleanUName = uData.displayName || uData.studentName || uData.name;
          if (!isStaffName(cleanUName)) userDisplayName = cleanUName;
        }
      } catch (_) {}
    }
    const studentReg = data.regNo || data.studentRegNo || data.examNumber || "";
    if ((!userDisplayName || isStaffName(userDisplayName)) && studentReg) {
      try {
        const idxSnap = await db.collection("student_index").doc(studentReg.replace(/[^a-zA-Z0-9]/g, "_")).get();
        if (idxSnap.exists) {
          const sDocId = idxSnap.data().studentDocId;
          if (sDocId) {
            const sSnap = await db.collection("students").doc(sDocId).get();
            if (sSnap.exists) {
              const sData = sSnap.data()._student_data?.[studentReg] || sSnap.data();
              const candName = sData.displayName || sData.studentName || sData.name;
              if (!isStaffName(candName)) userDisplayName = candName;
            }
          }
        }
      } catch (_) {}
    }
    if (!userDisplayName || isStaffName(userDisplayName)) {
      userDisplayName = "Student";
    }

    const { amount, category, appId, returnUrl } = data;

    if (!amount || typeof amount !== "number" || amount <= 0) {
      throw new HttpsError("invalid-argument", "Valid amount is required.");
    }
    if (!returnUrl || typeof returnUrl !== "string") {
      throw new HttpsError("invalid-argument", "Return URL is required.");
    }

    const { baseUrl, merchantId, basicAuth, isSandbox, apiKey } = await getExamCellConfig();

    if (!apiKey || !merchantId) {
      throw new HttpsError(
        "failed-precondition",
        "Exam Cell HDFC Gateway credentials are not yet configured. Please contact Exam Cell."
      );
    }

    const orderId = generateExamOrderId();
    const projectId = process.env.GCLOUD_PROJECT || "outcomex";
    const region = "us-central1";
    let callbackUrl;
    if (process.env.FUNCTIONS_EMULATOR === "true") {
      callbackUrl = `http://127.0.0.1:5001/${projectId}/${region}/examCellPaymentCallback`;
    } else {
      callbackUrl = `https://${region}-${projectId}.cloudfunctions.net/examCellPaymentCallback`;
    }

    const payload = {
      order_id: orderId,
      amount: amount.toFixed(2),
      currency: "INR",
      customer_id: uid,
      customer_email: userEmail,
      customer_phone: data.phone || "",
      payment_page_client_id: merchantId,
      action: "paymentPage",
      return_url: callbackUrl,
      description: `Exam Cell Payment: ${category || "Photocopy"}`,
      first_name: userDisplayName.split(" ")[0] || "Student",
      last_name: userDisplayName.split(" ").slice(1).join(" ") || "",
      source_object: "PAYMENT_LINK",
    };

    let response;
    try {
      response = await fetch(`${baseUrl}/session`, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basicAuth}`,
          "x-merchantid": merchantId,
          "Content-Type": "application/json",
          version: "2023-06-30",
        },
        body: JSON.stringify(payload),
      });
    } catch (networkError) {
      console.error("Exam Cell HDFC network error:", networkError);
      throw new HttpsError("unavailable", "Exam Cell Payment gateway is temporarily unreachable.");
    }

    let responseText = "";
    try {
      responseText = await response.text();
    } catch (readError) {
      throw new HttpsError("internal", "Could not read response from Exam Cell gateway.");
    }

    let responseData;
    try {
      responseData = JSON.parse(responseText);
    } catch (parseError) {
      throw new HttpsError("internal", "Exam Cell gateway returned invalid response format.");
    }

    if (!response.ok || !responseData?.payment_links?.web) {
      const errMsg = responseData?.error_info?.developer_message || responseData?.message || "Exam Cell Payment session creation failed";
      throw new HttpsError("failed-precondition", errMsg);
    }

    const paymentRecord = {
      orderId,
      appId: appId || "",
      uid,
      studentId: uid,
      studentEmail: userEmail,
      studentName: userDisplayName,
      category: category || "Photocopy",
      amount,
      currency: "INR",
      status: "PENDING",
      hdfcOrderId: responseData.id,
      paymentUrl: responseData.payment_links.web,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
      environment: isSandbox ? "sandbox" : "production",
      returnUrl,
      isOnline: true,
      mode: "gateway",
      allocations: data.allocations || null,
    };

    await db.collection("exam_cell_payments").doc(orderId).set(paymentRecord);

    if (appId) {
      let collectionName = "photocopy_applications";
      const catLower = (category || "").toLowerCase();
      if (catLower.includes("review")) {
        collectionName = "review_applications";
      } else if (catLower.includes("revaluation")) {
        collectionName = "revaluation_applications";
      } else if (catLower.includes("ese")) {
        collectionName = "ese_fee_registrations";
      }
      try {
        await db.collection(collectionName).doc(appId).update({
          orderId,
          updatedAt: Timestamp.now(),
        });
      } catch (err) {
        console.error(`Failed to update ${collectionName} orderId:`, err);
      }
    }

    return {
      success: true,
      orderId,
      paymentUrl: responseData.payment_links.web,
    };
  }
);

exports.verifyExamCellPayment = onCall(
  {
    cors: true,
    maxInstances: 20,
    concurrency: 40,
    enforceAppCheck: false,
  },
  async (request) => {
    validateAuth(request);
    const { data } = request;
    const { orderId, appId } = data;

    if (!orderId || typeof orderId !== "string") {
      throw new HttpsError("invalid-argument", "Order ID is required.");
    }

    const paymentRef = db.collection("exam_cell_payments").doc(orderId);
    const paymentSnap = await paymentRef.get();
    if (!paymentSnap.exists) {
      throw new HttpsError("not-found", "Exam Cell Payment record not found.");
    }
    const paymentRecord = paymentSnap.data();

    // Prevent double processing if the transaction was already successful
    if (paymentRecord.status === "SUCCESS") {
      return {
        success: true,
        status: "SUCCESS",
        hdfcStatus: paymentRecord.hdfcStatus,
        amount: parseFloat(paymentRecord.chargedAmount || paymentRecord.amount || 0),
        orderId,
      };
    }

    const { baseUrl, merchantId, basicAuth } = await getExamCellConfig();

    let responseData = {};
    let localStatus = paymentRecord.status || "PENDING";
    let rawStatus = paymentRecord.hdfcStatus || "";

    const headers = {
      Authorization: `Basic ${basicAuth}`,
      "x-merchantid": merchantId,
      "Content-Type": "application/json",
      version: "2023-06-30",
    };
    if (paymentRecord.uid || paymentRecord.studentId) {
      headers["x-customerid"] = paymentRecord.uid || paymentRecord.studentId;
    }

    try {
      const response = await fetch(`${baseUrl}/orders/${orderId}`, {
        method: "GET",
        headers,
      });

      if (response.ok) {
        const responseText = await response.text();
        try {
          responseData = JSON.parse(responseText);
          rawStatus = (
            responseData.status ||
            responseData.order_status ||
            responseData.txn_status ||
            responseData.payment_gateway_response?.status ||
            responseData.payment_gateway_response?.order_status ||
            responseData.payment_links?.status ||
            ""
          ).toUpperCase();
        } catch (_) {}
      }
    } catch (networkError) {
      console.error("Exam Cell Payment status check network error:", networkError);
    }

    const successStatuses = ["CHARGED", "SUCCESS", "PAID", "COMPLETED", "CAPTURED", "SETTLED", "AUTHENTICATED", "SUCCESSFUL"];
    const failedStatuses = ["FAILED", "EXPIRED", "VOID", "DECLINED", "CANCELLED", "AUTHENTICATION_FAILED", "AUTHORIZATION_FAILED", "JUSPAY_DECLINED"];

    if (
      successStatuses.includes(rawStatus) ||
      successStatuses.includes((paymentRecord.status || "").toUpperCase()) ||
      successStatuses.includes((paymentRecord.hdfcStatus || "").toUpperCase())
    ) {
      localStatus = "SUCCESS";
    } else if (failedStatuses.includes(rawStatus)) {
      localStatus = "FAILED";
    }

    if (localStatus === "SUCCESS") {
      await fulfillExamCellPaymentSuccess(orderId, responseData, { appId, auditSource: "verifyExamCellPayment_callable" });
    } else {
      await paymentRef.update({
        hdfcStatus: rawStatus || paymentRecord.hdfcStatus || "UNKNOWN",
        status: localStatus,
        updatedAt: Timestamp.now(),
        verifiedAt: Timestamp.now(),
      });
    }

    return {
      success: localStatus === "SUCCESS",
      status: localStatus,
      hdfcStatus: rawStatus,
      amount: parseFloat(responseData.amount || paymentRecord.amount || 0),
      orderId,
    };
  }
);

exports.examCellPaymentCallback = onRequest(
  {
    cors: true,
    secrets: HDFC_SECRETS,
  },
  async (req, res) => {
    const orderId = req.body?.order_id || req.query?.order_id || req.body?.orderId || req.query?.orderId || "";
    console.log(`examCellPaymentCallback: Received return for order ${orderId}`);

    let redirectUrl = "https://outcomex.web.app/student/ese-fee"; // Default fallback

    if (orderId) {
      try {
        const docSnap = await db.collection("exam_cell_payments").doc(orderId).get();
        if (docSnap.exists) {
          const data = docSnap.data();
          if (data.returnUrl) redirectUrl = data.returnUrl;
        }

        // Proactive server-side check with HDFC SmartGateway Exam Cell Account #76983
        const { baseUrl, merchantId, basicAuth } = await getExamCellConfig();
        if (basicAuth && merchantId) {
          const gwRes = await fetch(`${baseUrl}/orders/${orderId}`, {
            method: "GET",
            headers: {
              Authorization: `Basic ${basicAuth}`,
              "x-merchantid": merchantId,
              "Content-Type": "application/json",
              version: "2023-06-30",
            },
          });
          if (gwRes.ok) {
            const gwData = await gwRes.json();
            const stat = (gwData.status || "").toUpperCase();
            if (["CHARGED", "SUCCESS", "PAID", "COMPLETED", "CAPTURED", "SETTLED"].includes(stat)) {
              await fulfillExamCellPaymentSuccess(orderId, gwData, { auditSource: "browser_callback" });
              console.log(`examCellPaymentCallback: Order ${orderId} verified and fulfilled on server.`);
            }
          }
        }
      } catch (err) {
        console.error("Error in examCellPaymentCallback verification:", err);
      }
    }

    if (orderId) {
      const connector = redirectUrl.includes("?") ? "&" : "?";
      redirectUrl = `${redirectUrl}${connector}order_id=${orderId}`;
    }
    sendRedirectResponse(res, redirectUrl);
  }
);

/**
 * Phase 2 — Server-to-Server Webhook Endpoint
 * Receives asynchronous notifications from HDFC SmartGateway/Juspay for both Merchant #76980 and #76983.
 * Independently queries GET /orders/{order_id} using server credentials before executing fulfillment.
 */
exports.smartGatewayWebhook = onRequest(
  {
    cors: true,
    secrets: HDFC_SECRETS,
  },
  async (req, res) => {
    try {
      const payload = req.body || {};
      let orderId = (payload.order_id || payload.orderId || payload.content?.order?.order_id || req.query?.order_id || "").trim();
      const eventName = payload.event_name || payload.event || payload.action || "UNKNOWN_EVENT";

      // Gateway attempt normalization (e.g. 76983-EXAMMUL31Z5F7942711D-1 -> EXAMMUL31Z5F7942711D)
      const attemptMatch = orderId.match(/^(?:76980|76983)-(.+)-\d+$/);
      if (attemptMatch) {
        orderId = attemptMatch[1];
      }

      console.log(`smartGatewayWebhook received: event=${eventName}, orderId=${orderId}`);

      // Basic request format validation to block unauthenticated garbage requests from causing outbound API calls
      if (!orderId || !/^[A-Za-z0-9_-]{5,64}$/.test(orderId)) {
        return res.status(200).json({ status: "ignored", warning: "Invalid or missing order_id in webhook payload" });
      }

      const isExam = orderId.startsWith("EXAM") || orderId.includes("EXAM");

      if (isExam) {
        const { baseUrl, merchantId, basicAuth } = await getExamCellConfig();
        if (basicAuth && merchantId) {
          const gwRes = await fetch(`${baseUrl}/orders/${orderId}`, {
            method: "GET",
            headers: {
              Authorization: `Basic ${basicAuth}`,
              "x-merchantid": merchantId,
              "Content-Type": "application/json",
              version: "2023-06-30",
            },
          });
          if (gwRes.ok) {
            const gwData = await gwRes.json();
            const stat = (gwData.status || "").toUpperCase();
            if (["CHARGED", "SUCCESS", "PAID", "COMPLETED", "CAPTURED", "SETTLED"].includes(stat)) {
              await fulfillExamCellPaymentSuccess(orderId, gwData, { auditSource: "webhook" });
              console.log(`smartGatewayWebhook: Exam Cell order ${orderId} fulfilled.`);
            }
          }
        }
      } else {
        const { baseUrl, merchantId, basicAuth } = getConfig();
        if (basicAuth && merchantId) {
          const gwRes = await fetch(`${baseUrl}/orders/${orderId}`, {
            method: "GET",
            headers: {
              Authorization: `Basic ${basicAuth}`,
              "x-merchantid": merchantId,
              "Content-Type": "application/json",
              version: "2023-06-30",
            },
          });
          if (gwRes.ok) {
            const gwData = await gwRes.json();
            if (gwData.status === "CHARGED") {
              await fulfillFeePaymentSuccess(orderId, gwData, { auditSource: "webhook" });
              console.log(`smartGatewayWebhook: College Fee order ${orderId} fulfilled.`);
            }
          }
        }
      }

      return res.status(200).json({ status: "acknowledged", orderId });
    } catch (err) {
      console.error("smartGatewayWebhook processing error:", err);
      return res.status(200).json({ status: "error_logged", error: err.message });
    }
  }
);

/**
 * Phase 3 — Automatic Scheduled Payment Reconciliation
 * Sweeps PENDING transactions older than 10 minutes and younger than 24 hours.
 * Reconciles both Merchant #76980 (College) and #76983 (Exam Cell) independently.
 */
exports.reconcilePendingPayments = onSchedule(
  {
    schedule: "every 15 minutes",
    timeZone: "Asia/Kolkata",
    secrets: HDFC_SECRETS,
  },
  async (event) => {
    console.log("Starting reconcilePendingPayments sweep...");
    const cutoffTime = Timestamp.fromDate(new Date(Date.now() - 10 * 60 * 1000)); // older than 10 mins
    const maxLookback = Timestamp.fromDate(new Date(Date.now() - 72 * 60 * 60 * 1000)); // within 72 hours (sweeps dropped/abandoned UPI attempts)

    let reconciledCount = 0;

    // 1. Reconcile College Fee Operations (Merchant 76980)
    try {
      const { baseUrl, merchantId, basicAuth } = getConfig();
      if (basicAuth && merchantId) {
        const pendingCollege = await db.collection("fee_payments")
          .where("status", "==", "PENDING")
          .where("createdAt", ">=", maxLookback)
          .where("createdAt", "<=", cutoffTime)
          .limit(25)
          .get();

        for (const doc of pendingCollege.docs) {
          const orderId = doc.id;
          try {
            const gwRes = await fetch(`${baseUrl}/orders/${orderId}`, {
              method: "GET",
              headers: {
                Authorization: `Basic ${basicAuth}`,
                "x-merchantid": merchantId,
                "Content-Type": "application/json",
                version: "2023-06-30",
              },
            });
            if (gwRes.ok) {
              const gwData = await gwRes.json();
              if (gwData.status === "CHARGED") {
                await fulfillFeePaymentSuccess(orderId, gwData, { auditSource: "reconciliation_cron" });
                reconciledCount++;
                console.log(`Reconciled College order ${orderId} -> SUCCESS`);
              } else if (["FAILED", "EXPIRED", "VOID", "DECLINED"].includes((gwData.status || "").toUpperCase())) {
                await doc.ref.update({
                  status: "FAILED",
                  hdfcStatus: gwData.status,
                  updatedAt: Timestamp.now(),
                });
              }
            }
          } catch (err) {
            console.error(`Error reconciling College order ${orderId}:`, err);
          }
        }
      }
    } catch (cErr) {
      console.error("College fee reconciliation error:", cErr);
    }

    // 2. Reconcile Exam Cell / COE Operations (Merchant 76983)
    try {
      const { baseUrl, merchantId, basicAuth } = await getExamCellConfig();
      if (basicAuth && merchantId) {
        const pendingExam = await db.collection("exam_cell_payments")
          .where("status", "==", "PENDING")
          .where("createdAt", ">=", maxLookback)
          .where("createdAt", "<=", cutoffTime)
          .limit(25)
          .get();

        for (const doc of pendingExam.docs) {
          const orderId = doc.id;
          try {
            const gwRes = await fetch(`${baseUrl}/orders/${orderId}`, {
              method: "GET",
              headers: {
                Authorization: `Basic ${basicAuth}`,
                "x-merchantid": merchantId,
                "Content-Type": "application/json",
                version: "2023-06-30",
              },
            });
            if (gwRes.ok) {
              const gwData = await gwRes.json();
              const stat = (gwData.status || "").toUpperCase();
              if (["CHARGED", "SUCCESS", "PAID", "COMPLETED", "CAPTURED", "SETTLED"].includes(stat)) {
                await fulfillExamCellPaymentSuccess(orderId, gwData, { auditSource: "reconciliation_cron" });
                reconciledCount++;
                console.log(`Reconciled Exam Cell order ${orderId} -> SUCCESS`);
              } else if (["FAILED", "EXPIRED", "VOID", "DECLINED"].includes(stat)) {
                await doc.ref.update({
                  status: "FAILED",
                  hdfcStatus: gwData.status,
                  updatedAt: Timestamp.now(),
                });
              }
            }
          } catch (err) {
            console.error(`Error reconciling Exam Cell order ${orderId}:`, err);
          }
        }
      }
    } catch (eErr) {
      console.error("Exam Cell fee reconciliation error:", eErr);
    }

    console.log(`reconcilePendingPayments finished. Reconciled ${reconciledCount} transactions.`);
    return null;
  }
);

/**
 * Phase 6 — Admin Payment Verification and Instant Recovery Tool
 * Authenticated admin callable to query HDFC SmartGateway and recover any pending transaction.
 */
exports.adminVerifyAndRecoverPayment = onCall(
  {
    cors: true,
    secrets: HDFC_SECRETS,
  },
  async (request) => {
    validateAuth(request);
    const { data } = request;
    const { orderId } = data || {};

    if (!orderId || typeof orderId !== "string") {
      throw new HttpsError("invalid-argument", "Valid Order ID is required.");
    }

    let cleanOrderId = orderId.trim();
    // Normalize gateway attempt IDs (e.g. 76983-EXAMMUL31Z5F7942711D-1 -> EXAMMUL31Z5F7942711D)
    const attemptMatch = cleanOrderId.match(/^(?:76980|76983)-(.+)-\d+$/);
    if (attemptMatch) {
      cleanOrderId = attemptMatch[1];
    }
    const isExam = cleanOrderId.startsWith("EXAM") || cleanOrderId.includes("EXAM");

    if (isExam) {
      const { baseUrl, merchantId, basicAuth } = await getExamCellConfig();
      if (!basicAuth || !merchantId) {
        throw new HttpsError("failed-precondition", "Exam Cell gateway credentials not configured.");
      }

      let response;
      try {
        response = await fetch(`${baseUrl}/orders/${cleanOrderId}`, {
          method: "GET",
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "x-merchantid": merchantId,
            "Content-Type": "application/json",
            version: "2023-06-30",
          },
        });
      } catch (err) {
        throw new HttpsError("unavailable", "Payment gateway unreachable.");
      }

      if (!response.ok) {
        const text = await response.text();
        throw new HttpsError("internal", `Gateway returned HTTP ${response.status}: ${text}`);
      }

      const orderData = await response.json();
      const status = (orderData.status || "").toUpperCase();
      const pg = orderData.payment_gateway_response || {};
      const rrn = pg.rrn || orderData.rrn || "N/A";
      const txnId = pg.txn_id || pg.epg_txn_id || orderData.txn_id || "N/A";
      const amount = parseFloat(orderData.amount || 0);

      let recovered = false;
      let fulfillmentResult = null;

      if (["CHARGED", "SUCCESS", "PAID", "COMPLETED", "CAPTURED", "SETTLED"].includes(status)) {
        fulfillmentResult = await fulfillExamCellPaymentSuccess(cleanOrderId, orderData, {
          auditSource: "admin_recovery",
          adminUid: request.auth.uid,
        });
        recovered = true;
      }

      return {
        success: true,
        orderId: cleanOrderId,
        merchantId: "76983 (Exam Cell)",
        status,
        amount,
        rrn,
        txnId,
        recovered,
        receiptNo: fulfillmentResult?.receiptNo || null,
        gatewayData: orderData,
      };
    } else {
      const { baseUrl, merchantId, basicAuth } = getConfig();
      if (!basicAuth || !merchantId) {
        throw new HttpsError("failed-precondition", "College fee gateway credentials not configured.");
      }

      let response;
      try {
        response = await fetch(`${baseUrl}/orders/${cleanOrderId}`, {
          method: "GET",
          headers: {
            Authorization: `Basic ${basicAuth}`,
            "x-merchantid": merchantId,
            "Content-Type": "application/json",
            version: "2023-06-30",
          },
        });
      } catch (err) {
        throw new HttpsError("unavailable", "Payment gateway unreachable.");
      }

      if (!response.ok) {
        const text = await response.text();
        throw new HttpsError("internal", `Gateway returned HTTP ${response.status}: ${text}`);
      }

      const orderData = await response.json();
      const status = (orderData.status || "").toUpperCase();
      const pg = orderData.payment_gateway_response || {};
      const rrn = pg.rrn || orderData.rrn || "N/A";
      const txnId = pg.txn_id || pg.epg_txn_id || orderData.txn_id || "N/A";
      const amount = parseFloat(orderData.amount || 0);

      let recovered = false;
      let fulfillmentResult = null;

      if (status === "CHARGED") {
        fulfillmentResult = await fulfillFeePaymentSuccess(cleanOrderId, orderData, {
          auditSource: "admin_recovery",
          adminUid: request.auth.uid,
        });
        recovered = true;
      }

      return {
        success: true,
        orderId: cleanOrderId,
        merchantId: "76980 (College Fee)",
        status,
        amount,
        rrn,
        txnId,
        recovered,
        receiptNo: fulfillmentResult?.receiptNo || null,
        gatewayData: orderData,
      };
    }
  }
);

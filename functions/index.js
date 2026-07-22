const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { defineSecret } = require("firebase-functions/params");
const { initializeApp } = require("firebase-admin/app");
const { getFirestore, Timestamp } = require("firebase-admin/firestore");
const { randomUUID } = require("crypto");

initializeApp();
const db = getFirestore();

const HDFC_API_KEY = defineSecret("HDFC_API_KEY");
const HDFC_MERCHANT_ID = defineSecret("HDFC_MERCHANT_ID");
const HDFC_MODE = defineSecret("HDFC_MODE");

const SANDBOX_BASE = "https://smartgateway.hdfcuat.bank.in";
const PRODUCTION_BASE = "https://smartgateway.hdfcbank.in";

function getConfig() {
  const isSandbox = HDFC_MODE.value() !== "production";
  const baseUrl = isSandbox ? SANDBOX_BASE : PRODUCTION_BASE;
  const apiKey = HDFC_API_KEY.value();
  const merchantId = HDFC_MERCHANT_ID.value();
  const basicAuth = Buffer.from(`${apiKey}:`).toString("base64");
  return { baseUrl, apiKey, merchantId, basicAuth, isSandbox };
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

exports.createPaymentSession = onCall(
  {
    secrets: [HDFC_API_KEY, HDFC_MERCHANT_ID, HDFC_MODE],
    cors: true,
    maxInstances: 20,
    concurrency: 40,
    enforceAppCheck: false,
  },
  async (request) => {
    validateAuth(request);
    const { data } = request;
    const uid = request.auth.uid;
    const userEmail = request.auth.token.email || "";
    const userName = request.auth.token.name || "";

    const { amount, feeHead, returnUrl } = data;

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
    const userSnap = await db.collection("users").doc(uid).get();
    if (!userSnap.exists) {
      throw new HttpsError("not-found", "User profile not found.");
    }
    const userData = userSnap.data();
    const { programme, department, batch, regNo } = userData;

    if (!programme || !batch) {
      throw new HttpsError("failed-precondition", "Student profile is incomplete (programme/batch missing).");
    }

    // Fetch seat category (quota)
    let seatCategory = userData._profile_data?.quotaAskedFor || "";
    if (regNo) {
      try {
        const sanitizedReg = regNo.replace(/[^a-zA-Z0-9]/g, "_");
        const idxSnap = await db.collection("student_index").doc(sanitizedReg).get();
        if (idxSnap.exists) {
          const sDocId = idxSnap.data().studentDocId;
          if (sDocId) {
            const sSnap = await db.collection("students").doc(sDocId).get();
            if (sSnap.exists) {
              const extra = sSnap.data()._student_data?.[regNo] || {};
              if (extra.quotaAskedFor) {
                seatCategory = extra.quotaAskedFor;
              }
            }
          }
        }
      } catch (err) {
        console.error("Error fetching seat category on backend:", err);
      }
    }

    // Fetch matching fee configurations for this feeHead
    const feeConfigsSnap = await db.collection("fee_configurations")
      .where("head", "==", feeHead)
      .get();

    let matchingConfig = null;
    const normStudentProg = (programme || "").replace(/[_.\s]/g, '').toLowerCase();
    const normStudentDept = (department || "").replace(/[_.\s]/g, '').toLowerCase();
    const normStudentBatch = (batch || "").trim().toLowerCase();

    feeConfigsSnap.forEach((doc) => {
      const data = doc.data();
      const normDataProg = (data.programme || "").replace(/[_.\s]/g, '').toLowerCase();
      const normDataDept = (data.department || "").replace(/[_.\s]/g, '').toLowerCase();
      const normDataBatch = (data.batch || "").trim().toLowerCase();

      const isProgMatch = normDataProg && normDataProg === normStudentProg;
      const isDeptMatch = !normDataDept || normDataDept === "all" || normDataDept === normStudentDept;
      const isBatchMatch = normDataBatch && normDataBatch === normStudentBatch;
      const isQuotaMatch = !seatCategory || !data.quota || data.quota === seatCategory;

      if (isProgMatch && isDeptMatch && isBatchMatch && isQuotaMatch) {
        matchingConfig = data;
      }
    });

    if (!matchingConfig) {
      throw new HttpsError("invalid-argument", `No fee configuration found for ${feeHead}.`);
    }

    const configAmount = Number(matchingConfig.amount) || 0;

    // Fetch previous successful payments for this feeHead
    const previousPaymentsSnap = await db.collection("fee_payments")
      .where("uid", "==", uid)
      .where("feeHead", "==", feeHead)
      .get();

    let totalPaid = 0;
    previousPaymentsSnap.forEach((doc) => {
      const data = doc.data();
      if (data.status === "SUCCESS") {
        totalPaid += Number(data.chargedAmount || data.amount || 0);
      }
    });

    const maxAllowedPay = Math.max(0, configAmount - totalPaid);
    if (amount > maxAllowedPay + 1) { // 1 rupee buffer for rounding
      throw new HttpsError("invalid-argument", `Requested amount ₹${amount} exceeds the outstanding balance of ₹${maxAllowedPay} for ${feeHead}.`);
    }

    const { baseUrl, merchantId, basicAuth, isSandbox } = getConfig();
    const orderId = generateOrderId();

    const payload = {
      order_id: orderId,
      amount: amount.toFixed(2),
      currency: "INR",
      customer_id: uid,
      customer_email: userEmail,
      customer_phone: data.phone || "",
      payment_page_client_id: merchantId,
      action: "paymentPage",
      return_url: returnUrl,
      description: `Fee payment: ${feeHead}`,
      first_name: userName.split(" ")[0] || "Student",
      last_name: userName.split(" ").slice(1).join(" ") || "",
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

    const responseData = await response.json();

    if (!response.ok) {
      const errMsg = responseData?.error_info?.developer_message
        || responseData?.error_message
        || "Payment session creation failed";
      console.error("HDFC API error:", response.status, JSON.stringify(responseData));
      throw new HttpsError("internal", errMsg);
    }

    if (!responseData?.payment_links?.web) {
      console.error("HDFC missing payment_links:", JSON.stringify(responseData));
      throw new HttpsError("internal", "Payment gateway returned an invalid response.");
    }

    const paymentRecord = {
      orderId,
      uid,
      studentEmail: userEmail,
      studentName: userName,
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

exports.verifyPayment = onCall(
  {
    secrets: [HDFC_API_KEY, HDFC_MERCHANT_ID, HDFC_MODE],
    cors: true,
    maxInstances: 20,
    concurrency: 40,
    enforceAppCheck: false,
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

    const responseData = await response.json();

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
    } else if (["FAILED", "EXPIRED", "VOID"].includes(hdfcStatus)) {
      localStatus = "FAILED";
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

    if (localStatus === "SUCCESS" && responseData.amount) {
      updateData.chargedAmount = parseFloat(responseData.amount);
    }

    try {
      await db.collection("fee_payments").doc(orderId).update(updateData);
    } catch (dbError) {
      console.error("Firestore update error:", dbError);
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

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
    if (hdfcStatus === "CHARGED") localStatus = "SUCCESS";
    else if (["FAILED", "EXPIRED", "VOID"].includes(hdfcStatus)) localStatus = "FAILED";

    const updateData = {
      hdfcStatus,
      status: localStatus,
      updatedAt: Timestamp.now(),
      verifiedAt: Timestamp.now(),
    };

    if (localStatus === "SUCCESS" && responseData.amount) {
      updateData.chargedAmount = parseFloat(responseData.amount);
    }

    if (responseData.payment_gateway_response) {
      const pg = responseData.payment_gateway_response;
      updateData.gatewayResponse = {
        rrn: pg.rrn || "",
        txnId: pg.txn_id || "",
        epgTxnId: pg.epg_txn_id || "",
        authCode: pg.auth_id_code || "",
        respCode: pg.resp_code || "",
        respMessage: pg.resp_message || "",
      };
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
    };
  }
);

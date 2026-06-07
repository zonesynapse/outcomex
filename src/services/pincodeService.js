const PINCODE_API = "https://api.postalpincode.in/pincode";

export async function fetchPincodeDetails(pincode) {
  if (!pincode || String(pincode).length !== 6) return null;
  try {
    const res = await fetch(`${PINCODE_API}/${pincode}`);
    const data = await res.json();
    if (data?.[0]?.Status === "Success" && data[0].PostOffice?.length > 0) {
      const po = data[0].PostOffice[0];
      return {
        district: po.District || "",
        state: po.State || "",
        country: po.Country || "India",
      };
    }
    return null;
  } catch {
    return null;
  }
}

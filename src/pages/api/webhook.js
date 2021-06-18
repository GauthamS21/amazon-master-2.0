import { buffer } from "micro";
import * as admin from "firebase-admin";
import { session } from "next-auth/client";
import { flushSync } from "react-dom";

// Connection to Firebase
const serviceAccount = require("../../../permissions.json");

const app = !admin.apps.length
  ? admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })
  : admin.app();

const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_SIGNING_SECRET;

const fullfillOrder = async (session) => {
  console.log("Working On Order", session);
  return app
    .firestore()
    .collection("user")
    .doc(session.metadata.email)
    .collection("orders")
    .doc(session.id)
    .set({
      amount: session.amount_total / 100,
      amount_shipping: session.total_details.amount_shipping / 100,
      images: JSON.parse(session.metadata.images),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    })
    .then(() => {
      console.log(`Success Order : ${session.id} has been added`);
    });
};
export default async (req, res) => {
  if (req.method === "POST") {
    const requestBuffer = await buffer(req);
    const payload = requestBuffer.toString();
    const sig = req.headers["stripe-signature"];

    let event;

    // Verify the event posted came from stripe
    try {
      event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
    } catch (err) {
      console.log("ERROR", err.message);
      return res.status(400).send(`WeebHook ERROR : ${err.message}`);
    }

    // Handle the checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      const session = event.data.object;

      // FulFill the order
      return fullfillOrder(session)
        .then(() => res.status(200))
        .catch((err) => res.status(400).send(`WebHook ERROR: ${err.message}`));
    }
  }
};

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

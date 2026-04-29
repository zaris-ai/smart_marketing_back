import express from "express";
import "dotenv/config";
import cors from "cors";
import path from 'node:path';
import routes from "./routes/index.js";
import { errorHandler } from "./middlewares/errorHandler.js";
import { notFound } from "./middlewares/notFound.js";

const app = express();

const allowedOrigins = [
  "https://smart.arkaanalyzer.com",
  "https://www.smart.arkaanalyzer.com",

  // local development
  "http://localhost:3000",
  "http://localhost:5173",
  "http://127.0.0.1:3000",
  "http://127.0.0.1:5173",
];

app.use(cors({
  origin: allowedOrigins,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
}));
app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));
app.options("*", cors());

app.use(express.json());

app.get("/health", (req, res) => {
  res.json({ ok: true, port: process.env.PORT || 8000 });
});

app.use("/api", routes);

app.use(notFound);
app.use(errorHandler);

export default app;
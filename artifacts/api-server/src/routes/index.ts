import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import landingPageRouter from "./landingPage";
import documentsRouter from "./documents";
import articlesRouter from "./articles";
import calendarRouter from "./calendar";
import settingsRouter from "./settings";
import dashboardRouter from "./dashboard";
import notificationsRouter from "./notifications";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(landingPageRouter);
router.use(documentsRouter);
router.use(articlesRouter);
router.use(calendarRouter);
router.use(settingsRouter);
router.use(dashboardRouter);
router.use(notificationsRouter);

export default router;

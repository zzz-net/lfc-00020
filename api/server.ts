/**
 * local server entry file, for local development
 */
import app from './app.js';
import { recoverStuckBatches } from './services/exportBatch.js';

/**
 * start server with port
 */
const PORT = 3088;

const server = app.listen(PORT, () => {
  console.log(`Server ready on port ${PORT}`);
  try {
    const result = recoverStuckBatches();
    if (result.recovered > 0 || result.failed > 0) {
      console.log(
        `[任务恢复] 启动恢复完成：pending自动重试 ${result.recovered} 个，processing标记失败 ${result.failed} 个`
      );
    }
  } catch (e) {
    console.error('[任务恢复] 启动恢复过程出错:', e);
  }
});

/**
 * close server
 */
process.on('SIGTERM', () => {
  console.log('SIGTERM signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('SIGINT signal received');
  server.close(() => {
    console.log('Server closed');
    process.exit(0);
  });
});

export default app;
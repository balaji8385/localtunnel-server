// import { Router } from "express";
// const router = Router();

// router.get('/api/status', (req: Request, res: Response) => {
//     const stats = manager.stats;
//     res.json({
//       tunnels: stats.tunnels,
//       mem: process.memoryUsage(),
//     });
//   });

//   // API endpoint: status for a specific tunnel.
//   router.get('/api/tunnels/:id/status', (req: Request<{ id: string }>, res: Response) => {
//     const clientId = req.params.id;
//     const client = manager.getClient(clientId);
//     if (!client) {
//       return res.sendStatus(404);
//     }
//     const stats = client.stats();
//     return res.json({
//       connected_sockets: stats.connectedSockets,
//     });
//   });

//   // API endpoint: disconnect a specific tunnel.
//   router.get('/api/tunnels/:id/kill', (req: Request, res: Response) => {
//     const clientId = req.params.id;
//     if (!opt.jwt_shared_secret) {
//       debug('disconnecting client with id %s, error: jwt_shared_secret is not used', clientId);
//       return res.status(403).json({ success: false, message: 'jwt_shared_secret is not used' });
//     }

//     if (!manager.hasClient(clientId)) {
//       debug('disconnecting client with id %s, error: client is not connected', clientId);
//       return res.status(404).json({ success: false, message: `client with id ${clientId} is not connected` });
//     }

//     const securityToken = req.headers.authorization;
//     if (!manager.getClient(clientId)?.isSecurityTokenEqual(securityToken)) {
//       debug('disconnecting client with id %s, error: securityToken is not equal', clientId);
//       return res.status(403).json({
//         success: false,
//         message: `client with id ${clientId} does not have the same securityToken as provided`
//       });
//     }

//     debug('disconnecting client with id %s', clientId);
//     manager.removeClient(clientId);
//     res.status(200).json({
//       success: true,
//       message: `client with id ${clientId} is disconnected`
//     });
//   });

//   // Root endpoint: create a new client if query "new" is provided, otherwise redirect.
//   router.get('/', async (req: Request, res: Response, next: NextFunction) => {
//     if (req.query.new !== undefined) {
//       const reqId = uuidv4();
//       debug('making new client with id %s', reqId);
//       try {
//         const info: any = await manager.newClient(
//           reqId,
//           opt.jwt_shared_secret ? req.headers.authorization as string : null
//         );
//         info.url = `${schema}://${info.id}.${req.headers.host}`;
//         res.json(info);
//       } catch (error) {
//         next(error);
//       }
//       return;
//     }
//     res.redirect(landingPage);
//   });

//   // Backwards compatibility: handle requests for a specific client subdomain.
//   router.get('/:clientId', async (req: Request, res: Response, next: NextFunction) => {
//     const reqId = req.params.clientId;
//     const validSubdomainRegex = /^(?:[a-z0-9][a-z0-9\-]{4,63}[a-z0-9]|[a-z0-9]{4,63})$/;
//     if (!validSubdomainRegex.test(reqId)) {
//       return res.status(403).json({
//         message: 'Invalid subdomain. Subdomains must be lowercase and between 4 and 63 alphanumeric characters.'
//       });
//     }
//     debug('making new client with id %s', reqId);
//     try {
//       const info = await manager.newClient(
//         reqId,
//         opt.jwt_shared_secret ? req.headers.authorization as string : null
//       );
//       info.url = `${schema}://${info.id}.${req.headers.host}`;
//       res.json(info);
//     } catch (error) {
//       next(error);
//     }
//   });
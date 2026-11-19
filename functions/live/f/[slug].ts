// Shared form links (/live/f/<form>): the page with the form's own preview tags. See edge/serve.ts.
import { servePreview } from '../../../edge/serve';

export const onRequestGet = (ctx: Parameters<typeof servePreview>[0]) => servePreview(ctx);

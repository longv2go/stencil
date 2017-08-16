import { BuildConfig, BuildContext, HydrateResults, PrerenderStatus, PrerenderUrl } from '../../util/interfaces';
import { buildError, catchError, hasError, readFile } from '../util';
import { prerenderUrl } from './prerender-url';
import * as Url from 'url';


export function prerenderApp(config: BuildConfig, ctx: BuildContext) {
  if (hasError(ctx.diagnostics)) {
    // no need to rebuild index.html if there were no app file changes
    return Promise.resolve();
  }

  if (!config.prerender || !config.prerender.include || !config.prerender.include.length) {
    const d = buildError(ctx.diagnostics);
    d.messageText = `Missing prerender config`;
    return Promise.resolve();
  }

  const prerenderHost = `http://${config.prerender.host}`;

  getUrlsToPrerender(config, prerenderHost, ctx);

  if (!ctx.prerenderUrlQueue.length) {
    const d = buildError(ctx.diagnostics);
    d.messageText = `No urls found in the prerender config`;
    return Promise.resolve();
  }

  // get the source index html content
  return readFile(config.sys, config.indexHtmlSrc).then(indexSrcHtml => {
    // let's do this
    return new Promise(resolve => {
      drainPrerenderQueue(config, ctx, indexSrcHtml, resolve);
    });

  }).catch(() => {
    const d = buildError(ctx.diagnostics);
    d.messageText = `missing index html: ${config.indexHtmlSrc}`;
  });
}


function drainPrerenderQueue(config: BuildConfig, ctx: BuildContext, indexSrcHtml: string, resolve: Function) {
  for (var i = 0; i < config.prerender.maxConcurrent; i++) {
    var activelyProcessingCount = ctx.prerenderUrlQueue.filter(p => p.status === PrerenderStatus.processing).length;

    if (activelyProcessingCount >= config.prerender.maxConcurrent) {
      // whooaa, slow down there buddy, let's not get carried away
      return;
    }

    var p = ctx.prerenderUrlQueue.find(p => p.status === PrerenderStatus.pending);
    if (p) {
      // we've got a url that's pending
      // well guess what, it's go time
      p.status = PrerenderStatus.processing;

      runNextPrerenderUrl(config, ctx, indexSrcHtml, p).then(p => {
        // finished with this one, onto the next
        p.status = PrerenderStatus.complete;

        // let's try to drain the queue again and let this
        // next call figure out if we're actually done or not
        drainPrerenderQueue(config, ctx, indexSrcHtml, resolve);
      });
    }
  }

  var remaining = ctx.prerenderUrlQueue.filter(p => {
    return p.status === PrerenderStatus.processing || p.status === PrerenderStatus.pending;
  }).length;

  if (remaining === 0) {
    // we're not actively processing anything
    // and there aren't anymore urls in the queue to be prerendered
    // so looks like our job here is done, good work team
    resolve();
  }
}


function runNextPrerenderUrl(config: BuildConfig, ctx: BuildContext, indexSrcHtml: string, p: PrerenderUrl) {
  return prerenderUrl(config, ctx, indexSrcHtml, p).then(results => {
    // awesome!!
    postPrerenderUrl(config, ctx, p, results);

  }).catch(err => {
    // darn, idk, bad news
    catchError(ctx.diagnostics, err);

  }).then(() => {
    return p;
  });
}


function postPrerenderUrl(config: BuildConfig, ctx: BuildContext, p: PrerenderUrl, results: HydrateResults) {
  // merge any diagnostics we just got from this
  ctx.diagnostics = ctx.diagnostics.concat(results.diagnostics);

  if (results.anchors && results.anchors.length) {
    results.anchors.forEach(anchor => {
      const url = normalizePrerenderUrl(config, results.url, anchor.href);

      if (url) {
        ctx.prerenderUrlQueue.push({
          url: url,
          status: PrerenderStatus.pending
        });
      }
    });
  }

  ctx.filesToWrite;
  config;
  console.log('p.url', p.url);
}


function normalizePrerenderUrl(config: BuildConfig, windowLocationHref: string, url: string) {
  try {
    if (typeof url !== 'string') return null;

    url = url.trim();

    if (url === '') return null;
    if (url.charAt(0) === '#') return null;
    if (url.charAt(0) === '?') return null;
    if (url.charAt(0) === '&') return null;
    if (url.charAt(0) === '=') return null;

    const urlObj = Url.parse(url);

    if (urlObj.protocol || urlObj.auth || urlObj.hostname || urlObj.port) return null;

    url = Url.resolve(windowLocationHref, url);

  } catch (e) {
    config.logger.error(`url: ${e}`);
    return null;
  }

  return url;
}


function getUrlsToPrerender(config: BuildConfig, windowLocationHref: string, ctx: BuildContext) {
  ctx.prerenderUrlQueue = [];

  if (!config.prerender.include) return;

  config.prerender.include.forEach(prerenderUrl => {
    prerenderUrl.url = normalizePrerenderUrl(config, windowLocationHref, prerenderUrl.url);

    if (!prerenderUrl.url) return;

    ctx.prerenderUrlQueue.push({
      url: prerenderUrl.url,
      status: PrerenderStatus.pending
    });
  });
}

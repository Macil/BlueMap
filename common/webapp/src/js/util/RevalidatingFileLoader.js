import {FileLoader} from "three";

// TODO maybe just fork FileLoader instead of hacking it

/**
 * A FileLoader that, if passed a Set of URLs, will be put into a mode where it
 * revalidates files by setting the Request cache option to "no-cache" for URLs
 * that have not previously been revalidated.
 */
export class RevalidatingFileLoader extends FileLoader {
    /** @type {Set<string> | undefined} */
    #revalidatedUrls;
    /** @type {string | undefined} */
    #currentGenerationMaskSuffix;

    /**
     * @param {Set<string> | undefined} revalidatedUrls - If set to a Set, this
     *   loader will revalidate URLs by setting the Request cache option to
     *   "no-cache" for URLs not in the Set, adding them to the Set once loaded.
     */
    setRevalidatedUrls(revalidatedUrls) {
        if (this.#revalidatedUrls !== revalidatedUrls) {
            this.#revalidatedUrls = revalidatedUrls;
            if (revalidatedUrls) {
                this.#currentGenerationMaskSuffix = "?" + Date.now() + "-" + Math.random().toString(36).substring(2, 8);
            } else {
                this.#currentGenerationMaskSuffix = undefined;
            }
        }
        return this;
    }

    load(url, onLoad, onProgress, onError) {
        // copy reference at start of method in case it is changed while loading
        const revalidatedUrls = this.#revalidatedUrls;

        if (revalidatedUrls && !revalidatedUrls.has(url)) {
            // rewrite the URL so FileLoader doesn't de-duplicate the request
            // with any ongoing pre-reset requests.
            const randomSuffix = this.#currentGenerationMaskSuffix;
            const maskedUrl = url + randomSuffix;

            // monkey-patch Request for two things:
            // 1. to set cache: "no-cache".
            // 2. to rewrite the URL back to its original form before the
            //    request is made.
            const originalRequest = Request;
            try {
                globalThis.Request = function PatchedRequestConstructor(input, options) {
                    if (typeof input !== 'string' || !input.endsWith(randomSuffix)) {
                        throw new Error("RevalidatingFileLoader patched Request called with unexpected URL: " + input);
                    }
                    input = input.slice(0, -randomSuffix.length);
                    return new originalRequest(input, {...options, cache: "no-cache"});
                };
                return super.load(maskedUrl, data => {
                    revalidatedUrls.add(url);
                    onLoad?.(data);
                }, onProgress, onError);
            } finally {
                globalThis.Request = originalRequest;
            }
        } else {
            return super.load(url, onLoad, onProgress, onError);
        }
    }
}

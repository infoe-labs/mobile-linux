# Third-party notices

Alpine Pocket original code is MIT licensed. The PWA foundation is adapted from
https://github.com/infoe-labs/pwa-base-layer; its privacy/storage policies and
component notices are preserved. No repository-level license was present in that
foundation at inspection; use here is explicitly directed by its owner. The project owner explicitly authorized this reuse and open-source delivery;
the MIT grant for Alpine Pocket covers its original integration code. Consult the
foundation owner for unrelated reuse outside this project.

LinuxOnTab is a research reference only. No application code or images were
copied. Its README lists component licenses but the inspected tree contains no
repository LICENSE granting application reuse.

v86: npm 0.5.472, source cc37f35c43bf14865d74ad76879ecf9410f69eb1,
BSD-2-Clause; BIOS from the same source revision. SeaBIOS rel-1.16.2 is LGPLv3
with included third-party portions; see its full source and COPYING files:
https://github.com/coreboot/seabios/tree/rel-1.16.2.

Generated Alpine assets: Alpine minirootfs 3.23.7 x86 and linux-virt 6.18.59-r0.
Alpine is a distribution, not a blanket license for its packages. Kernel GPL-2.0-only;
BusyBox GPL-2.0-only; musl MIT. The image builder records input hashes and the
image contains `/lib/apk/db/installed` for package licenses and origins.
See docs/ASSETS.md for source-compliance release requirements. VM assets are
locally generated and excluded from Git. No model weights are bundled.

Optional SmolLM2-135M-Instruct weights: HuggingFaceTB, Apache-2.0, revision
12fd25f77366fa6b3b4b768ec3050bf629380bac. License:
https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct/blob/12fd25f77366fa6b3b4b768ec3050bf629380bac/LICENSE.
Transformers.js is Apache-2.0; ONNX Runtime is MIT. Model quality and mobile
inference compatibility must be validated separately from library support.

The following sections reproduce license/NOTICE files available in the locked
npm dependency tree, including development tooling. `sbom.cdx.json` records exact
versions, npm integrity hashes and declared licenses. These declarations do not
replace inspection of the bundled binary and image components.

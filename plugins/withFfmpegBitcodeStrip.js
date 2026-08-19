/**
 * withFfmpegBitcodeStrip — App Store error 90482, fixed at the source.
 *
 * expo-camera-rtmp-publisher pulls in ffmpeg-kit-srt, whose eight
 * frameworks (ffmpegkit + libav*/libsw*) still ship with embedded
 * bitcode. Apple stopped ACCEPTING bitcode in uploads (Xcode 14+), so
 * App Store Connect rejects the otherwise-green .ipa at upload time:
 *
 *   "90482: Invalid Executable. The executable '...libavformat' contains
 *    bitcode."  — times eight.
 *
 * The binaries are prebuilt; nothing in our build settings can change
 * what's inside them. The fix is to strip the bitcode segment out of
 * each framework binary with `xcrun bitcode_strip` after pods install,
 * which is exactly what this plugin injects into the Podfile's existing
 * post_install block. Strip-in-place in Pods/ — the embed-frameworks
 * step then copies the already-clean binaries into the app.
 *
 * A config plugin rather than a one-off patch because prebuild runs
 * fresh on every EAS build: anything done to ios/ by hand evaporates.
 */
const { withDangerousMod } = require('@expo/config-plugins');
const fs = require('fs');
const path = require('path');

const MARKER = 'ffmpeg-bitcode-strip';

// Only these names get touched. A blanket strip of every framework in
// Pods/ would run tools over binaries that don't need it and turn a
// targeted fix into a build-wide side effect.
const SNIPPET = `
    # ${MARKER}: App Store 90482 — Apple rejects bitcode; ffmpeg-kit ships it.
    bitcode_strip = \`xcrun --find bitcode_strip\`.strip
    ffmpeg_names = %w[ffmpegkit libavcodec libavdevice libavfilter libavformat libavutil libswresample libswscale]
    Dir.glob(File.join(__dir__, 'Pods', '**', '*.framework')).each do |fw|
      name = File.basename(fw, '.framework')
      next unless ffmpeg_names.include?(name)
      bin = File.join(fw, name)
      next unless File.exist?(bin)
      puts "Stripping bitcode: #{name}"
      system("#{bitcode_strip} \\"#{bin}\\" -r -o \\"#{bin}\\"")
    end
`;

module.exports = function withFfmpegBitcodeStrip(config) {
  return withDangerousMod(config, [
    'ios',
    (cfg) => {
      const podfile = path.join(cfg.modRequest.platformProjectRoot, 'Podfile');
      let contents = fs.readFileSync(podfile, 'utf8');

      if (!contents.includes(MARKER)) {
        const anchor = /post_install do \|installer\|/;
        if (!anchor.test(contents)) {
          // Fail the build loudly rather than shipping another 90482:
          // a missing anchor means the Podfile template changed and this
          // plugin needs updating, not skipping.
          throw new Error(
            'withFfmpegBitcodeStrip: no post_install block found in Podfile — the Expo template changed; update this plugin.'
          );
        }
        contents = contents.replace(anchor, `post_install do |installer|${SNIPPET}`);
        fs.writeFileSync(podfile, contents);
      }
      return cfg;
    },
  ]);
};

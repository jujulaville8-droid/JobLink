import { MotionGlobalConfig } from 'motion/react';

// happy-dom creates the WAAPI `finished` promise eagerly in its Animation constructor and rejects it
// on cancel(), so every animation interrupted by unmount surfaces as an unhandled AbortError and
// fails the run. Real browsers create that promise lazily, so nothing rejects unless it is read.
// Skipping animations is motion's supported way to make components deterministic under test: targets
// are applied on the first frame, so assertions see final state and no WAAPI animation is created.
MotionGlobalConfig.skipAnimations = true;

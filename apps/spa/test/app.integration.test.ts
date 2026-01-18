import { mount } from '@vue/test-utils';
import { describe, expect, it, vi, afterEach } from 'vitest';
import App from '../src/App.vue';

const loadConfig = vi.fn();

vi.mock('../src/services/configLoader', () => ({
  loadConfig: () => loadConfig()
}));

const baseConfig = {
  settings: {
    user_coord_ch2056: { e: 2600000, n: 1200000 },
    worker_base_url: 'http://127.0.0.1:8787',
    refresh_minutes: 0.001
  },
  webcams: [
    {
      id: 'cam-1',
      name: 'Alpha',
      elevation_m_asl: 100,
      coord_ch2056: { e: 2600100, n: 1200200 },
      worker_bypass: true,
      source: { kind: 'snapshot', url: 'https://example.com/image.jpg' }
    },
    {
      id: 'cam-2',
      name: 'Beta',
      elevation_m_asl: 200,
      coord_ch2056: { e: 2600300, n: 1200400 },
      source: { kind: 'iframe', url: 'https://example.com/stream' }
    }
  ]
};

function makeConfig(overrides?: Partial<typeof baseConfig>) {
  return {
    ...baseConfig,
    ...overrides,
    settings: {
      ...baseConfig.settings,
      ...(overrides?.settings ?? {})
    }
  };
}

function setDocumentHidden(value: boolean) {
  Object.defineProperty(document, 'hidden', {
    configurable: true,
    get: () => value
  });
}

function dispatchPointer(el: Element, type: string, data: { pointerId: number; x: number; y: number }) {
  const PointerEventCtor = window.PointerEvent;
  if (PointerEventCtor) {
    el.dispatchEvent(
      new PointerEventCtor(type, {
        bubbles: true,
        pointerId: data.pointerId,
        clientX: data.x,
        clientY: data.y
      })
    );
    return;
  }

  const event = new MouseEvent(type, { bubbles: true });
  Object.defineProperty(event, 'pointerId', { value: data.pointerId });
  Object.defineProperty(event, 'clientX', { value: data.x });
  Object.defineProperty(event, 'clientY', { value: data.y });
  el.dispatchEvent(event);
}

async function flushPromises() {
  await Promise.resolve();
  await Promise.resolve();
}

afterEach(() => {
  vi.useRealTimers();
  loadConfig.mockReset();
});

describe('spa integration', () => {
  it('renders cards and resolves preview urls', async () => {
    loadConfig.mockResolvedValue(makeConfig());
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.vm.$nextTick();

    const cards = wrapper.findAll('.card');
    expect(cards.length).toBe(2);
    expect(wrapper.text()).toContain('Alpha');
    expect(wrapper.text()).toContain('Beta');

    const img = wrapper.find('.card__image-preview');
    const src = img.attributes('src');
    expect(src).toContain('https://example.com/image.jpg');
    expect(src).toContain('t=');

    expect(wrapper.text()).toContain('Preview unsupported');
  });

  it('opens fullscreen and supports pan + pinch gestures', async () => {
    loadConfig.mockResolvedValue(makeConfig());
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.vm.$nextTick();

    await wrapper.find('.card__image-action').trigger('click');
    expect(wrapper.find('.fullscreen').exists()).toBe(true);

    const stage = wrapper.find('.fullscreen__stage');
    const initialStyle = wrapper.find('.fullscreen__image').attributes('style') || '';
    dispatchPointer(stage.element, 'pointerdown', { pointerId: 1, x: 10, y: 10 });
    dispatchPointer(stage.element, 'pointermove', { pointerId: 1, x: 30, y: 35 });
    dispatchPointer(stage.element, 'pointerup', { pointerId: 1, x: 30, y: 35 });
    await wrapper.vm.$nextTick();

    const image = wrapper.find('.fullscreen__image');
    expect(image.attributes('style')).toContain('translate3d');

    dispatchPointer(stage.element, 'pointerdown', { pointerId: 1, x: 10, y: 10 });
    dispatchPointer(stage.element, 'pointerdown', { pointerId: 2, x: 50, y: 50 });
    dispatchPointer(stage.element, 'pointermove', { pointerId: 2, x: 80, y: 80 });
    dispatchPointer(stage.element, 'pointerup', { pointerId: 1, x: 10, y: 10 });
    dispatchPointer(stage.element, 'pointerup', { pointerId: 2, x: 80, y: 80 });
    await wrapper.vm.$nextTick();

    const afterStyle = wrapper.find('.fullscreen__image').attributes('style') || '';
    expect(afterStyle).not.toBe(initialStyle);
  });

  it('pauses refresh when tab is hidden and resumes on visibility', async () => {
    vi.useFakeTimers();
    loadConfig.mockResolvedValue(makeConfig({ settings: { refresh_minutes: 0.001 } }));
    setDocumentHidden(false);
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.vm.$nextTick();

    const img = wrapper.find('.card__image-preview');
    const firstSrc = img.attributes('src');

    vi.advanceTimersByTime(100);
    await wrapper.vm.$nextTick();
    const updatedSrc = img.attributes('src');
    expect(updatedSrc).not.toBe(firstSrc);

    setDocumentHidden(true);
    document.dispatchEvent(new Event('visibilitychange'));
    await wrapper.vm.$nextTick();
    const pausedSrc = img.attributes('src');

    vi.advanceTimersByTime(200);
    await wrapper.vm.$nextTick();
    expect(img.attributes('src')).toBe(pausedSrc);

    setDocumentHidden(false);
    document.dispatchEvent(new Event('visibilitychange'));
    await wrapper.vm.$nextTick();
    await wrapper.vm.$nextTick();
    expect(img.attributes('src')).not.toBe(pausedSrc);
  });

  it('shows error and retries after load failure', async () => {
    vi.useFakeTimers();
    loadConfig.mockResolvedValue(makeConfig({ settings: { refresh_minutes: 0 } }));
    const wrapper = mount(App);
    await flushPromises();
    await wrapper.vm.$nextTick();

    const img = wrapper.find('.card__image-preview');
    const initialSrc = img.attributes('src');
    await img.trigger('error');

    expect(wrapper.text()).toContain('Direct image failed');

    vi.advanceTimersByTime(2000);
    await wrapper.vm.$nextTick();
    expect(img.attributes('src')).not.toBe(initialSrc);
  });
});

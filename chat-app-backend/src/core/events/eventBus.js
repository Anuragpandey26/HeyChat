import { EventEmitter } from 'events';

class AppEventBus extends EventEmitter {}

const eventBus = new AppEventBus();

export default eventBus;

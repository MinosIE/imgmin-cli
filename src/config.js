import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_FILE = path.join(os.homedir(), '.imgminrc');

const DEFAULT_CONFIG = {
  quality: 80,
  format: '',
  recursive: false,
  outputDir: ''
};

let configCache = null;

/**
 * 获取配置路径
 */
export function getConfigPath() {
  return CONFIG_FILE;
}

/**
 * 读取配置
 */
export function getConfig() {
  if (configCache) {
    return configCache;
  }
  
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const content = fs.readFileSync(CONFIG_FILE, 'utf-8');
      configCache = { ...DEFAULT_CONFIG, ...JSON.parse(content) };
    } catch (error) {
      configCache = { ...DEFAULT_CONFIG };
    }
  } else {
    configCache = { ...DEFAULT_CONFIG };
  }
  
  return configCache;
}

/**
 * 保存配置
 */
export function saveConfig(config) {
  configCache = config;
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf-8');
}

/**
 * 获取单个配置项
 */
export function getConfigValue(key) {
  const config = getConfig();
  return config[key];
}

/**
 * 设置单个配置项
 */
export function setConfigValue(key, value) {
  const config = getConfig();
  config[key] = value;
  saveConfig(config);
}

/**
 * 删除配置项（恢复默认值）
 */
export function resetConfigValue(key) {
  const config = getConfig();
  if (key in DEFAULT_CONFIG) {
    config[key] = DEFAULT_CONFIG[key];
    saveConfig(config);
    return true;
  }
  return false;
}

/**
 * 重置所有配置
 */
export function resetConfig() {
  saveConfig({ ...DEFAULT_CONFIG });
}

/**
 * 检查配置是否存在
 */
export function hasConfigFile() {
  return fs.existsSync(CONFIG_FILE);
}

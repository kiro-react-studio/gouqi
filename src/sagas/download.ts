import {
    AsyncStorage
} from 'react-native'
import RNFS from 'react-native-fs'
import { put, call, fork, select } from 'redux-saga/effects'
import { ITrack, batchSongDetailsNew, getUserId } from '../services/api'
import { uniqBy } from 'lodash'
import { toastAction } from '../actions'
import { getDownloadedTracks, FILES_FOLDER, DOWNLOADED_TRACKS } from '../utils'
import { takeEvery, takeLatest } from 'redux-saga'

const IS_LOGIN = !!getUserId()

type ITracksPayload = { payload: ITrack[] }

async function donwloadSingleTrack (url: string, id: number) {
  const { statusCode, err }: any = await RNFS.downloadFile({
    fromUrl: url,
    toFile: `${FILES_FOLDER}/${id}.mp3`,
    background: true
  // tslint:disable-next-line:no-shadowed-variable
  }).promise.catch(err => ({err}))
  return !err || statusCode === 200
}

export async function MergeDownloadedTracks (original, tracks) {
  const merged = original.concat(tracks)
  return await AsyncStorage.setItem(DOWNLOADED_TRACKS, JSON.stringify(merged))
}

function* downloadTracksSaga ({ payload }: ITracksPayload) {
  yield put(toastAction('success', '已开始下载'))
  const downloadedTracks: ITrack[] = yield select((state: any) => state.download.tracks)
  let tasks = uniqBy(downloadedTracks.concat(payload), 'id')
  let success: ITrack[] = []
  let fail = 0

  if (IS_LOGIN) {
    const response = yield call(batchSongDetailsNew, payload.map(t => t.id.toString()))
    if (response.code === 200) {
      tasks = response.data.map(data => ({...data, mp3Url: data.url}))
    }
  }

  for (let task of tasks) {
    const isSuccess = yield call(donwloadSingleTrack, task.mp3Url, task.id)
    if (isSuccess) {
      success.push(task)
      yield put({
        type: 'download/tracks/merge',
        payload: {
          ...task,
          mp3Url: `${FILES_FOLDER}/${task.id}.mp3`
        }
      })
    } else {
      fail += 1
    }
  }

  yield put(toastAction('info', `下载成功 ${success.length} 个，失败 ${fail} 个`))
}

function* mergeTracksSaga ({ payload }: ITracksPayload) {
  const downloadedTracks: ITrack[] = yield select((state: any) => state.download.tracks)

  yield call(MergeDownloadedTracks, downloadedTracks, payload)
}

function* setTracksSaga ({ payload }: ITracksPayload) {
  yield call(AsyncStorage.setItem, DOWNLOADED_TRACKS, JSON.stringify(payload))
}

function* clearAllDownload () {
  const downloads: any[] = yield call(RNFS.readDir, FILES_FOLDER)
  yield call(Promise.all, downloads.map(d => RNFS.unlink(d.path)))

  yield put({
    type: 'download/tracks/set',
    payload: []
  })

  yield put(toastAction('success', '所有下载项目都清除成功'))
}

export default function* watchDownload () {
  yield [
    takeEvery('download/tracks', downloadTracksSaga),
    takeEvery('download/tracks/merge', mergeTracksSaga),
    takeEvery('download/tracks/set', setTracksSaga),
    takeLatest('download/clear', clearAllDownload)
  ]
}